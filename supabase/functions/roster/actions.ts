import { db, MEMBER_SELECT, type MemberRow } from "./db.ts";
import { HttpError } from "./http.ts";
import { importMembers } from "./importer.ts";
import {
  assignableRolesBelow,
  canManage,
  isPlatformRole,
  parseAssignableRole,
  placementError,
  type Placement,
} from "./rules.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_WHILE_PASSWORD_CHANGE = new Set(["me", "passwordChanged"]);

export function placementOf(row: MemberRow): Placement {
  return { role: row.role, companyId: row.company_id, branchId: row.branch_id, teamId: row.team_id };
}

export function toMemberDto(row: MemberRow, manageable: boolean) {
  return {
    id: row.id,
    email: row.email,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    userId: row.user_id,
    phone: row.phone,
    rosterOrder: row.roster_order,
    role: row.role,
    status: row.status,
    mustChangePassword: row.must_change_password,
    companyId: row.company_id,
    companyName: row.companies?.name ?? null,
    branchId: row.branch_id,
    branchName: row.branches?.name ?? null,
    teamId: row.team_id,
    teamName: row.teams?.name ?? null,
    canManage: manageable,
  };
}

export async function performAction(actor: MemberRow, body: Record<string, unknown>) {
  if (actor.must_change_password && !ALLOWED_WHILE_PASSWORD_CHANGE.has(String(body.action))) {
    throw new HttpError(403, "password_change_required");
  }
  switch (body.action) {
    case "me":
      return { member: toMemberDto(actor, false) };
    case "list":
      return listMembers(actor);
    case "import":
      return importMembers(actor, body);
    case "createCompany":
      return createCompany(actor, body);
    case "update":
      return updateMember(actor, body);
    case "remove":
      return removeMember(actor, body);
    case "passwordChanged":
      return finishPasswordChange(actor);
    case "profile":
      return updateProfile(actor, body);
    default:
      throw new HttpError(400, "unknown_action");
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(422, `invalid_${field}`);
  return value.trim();
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalUuid(value: unknown, field: string): string | null {
  const text = optionalString(value);
  if (text === null) return null;
  if (!UUID_PATTERN.test(text)) throw new HttpError(422, `invalid_${field}`);
  return text;
}

async function loadMember(id: string): Promise<MemberRow> {
  const { data, error } = await db.from("members").select(MEMBER_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "not_found");
  return data as MemberRow;
}

function scopedMembersQuery(actor: MemberRow) {
  const query = db
    .from("members")
    .select(MEMBER_SELECT)
    .order("roster_order", { ascending: true, nullsFirst: false })
    .order("full_name_en");
  if (isPlatformRole(actor.role)) return query;
  if (actor.role === "COMPANY_ADMIN" && actor.company_id) return query.eq("company_id", actor.company_id);
  if (actor.role === "BRANCH_MANAGER" && actor.branch_id) return query.eq("branch_id", actor.branch_id);
  if (actor.role === "TEAM_LEADER" && actor.team_id) return query.eq("team_id", actor.team_id);
  return query.eq("id", actor.id);
}

async function listMembers(actor: MemberRow) {
  const { data, error } = await scopedMembersQuery(actor);
  if (error) throw error;
  const me = placementOf(actor);
  const members = ((data ?? []) as MemberRow[]).map((row) =>
    toMemberDto(row, row.id !== actor.id && canManage(me, placementOf(row)))
  );
  return {
    members,
    lookups: await loadLookups(actor),
    assignableRoles: assignableRolesBelow(actor.role),
  };
}

async function loadLookups(actor: MemberRow) {
  const empty = { companies: [], branches: [], teams: [] };
  if (actor.role === "EMPLOYEE") return empty;
  const platform = isPlatformRole(actor.role);
  if (!platform && !actor.company_id) return empty;
  if (!platform && actor.role !== "COMPANY_ADMIN" && !actor.branch_id) return empty;
  if (!platform && actor.role === "TEAM_LEADER" && !actor.team_id) return empty;

  let companies = db.from("companies").select("id, name").order("name");
  let branches = db.from("branches").select("id, company_id, name").order("name");
  if (!platform) {
    companies = companies.eq("id", actor.company_id);
    branches =
      actor.role === "COMPANY_ADMIN"
        ? branches.eq("company_id", actor.company_id)
        : branches.eq("id", actor.branch_id as string);
  }
  const [companyRes, branchRes] = await Promise.all([companies, branches]);
  if (companyRes.error) throw companyRes.error;
  if (branchRes.error) throw branchRes.error;

  let teams = db.from("teams").select("id, branch_id, name").order("name");
  if (actor.role === "TEAM_LEADER") teams = teams.eq("id", actor.team_id as string);
  else if (!platform) teams = teams.in("branch_id", (branchRes.data ?? []).map((b: { id: string }) => b.id));
  const teamRes = (branchRes.data ?? []).length === 0 && !platform ? { data: [], error: null } : await teams;
  if (teamRes.error) throw teamRes.error;

  return { companies: companyRes.data ?? [], branches: branchRes.data ?? [], teams: teamRes.data ?? [] };
}

async function assertPlacementExists(p: Placement) {
  if (p.companyId) {
    const { data, error } = await db.from("companies").select("id").eq("id", p.companyId).maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(422, "invalid_placement");
  }
  if (p.branchId) {
    const { data, error } = await db.from("branches").select("id, company_id").eq("id", p.branchId).maybeSingle();
    if (error) throw error;
    if (!data || data.company_id !== p.companyId) throw new HttpError(422, "invalid_placement");
  }
  if (p.teamId) {
    const { data, error } = await db.from("teams").select("id, branch_id").eq("id", p.teamId).maybeSingle();
    if (error) throw error;
    if (!data || data.branch_id !== p.branchId) throw new HttpError(422, "invalid_placement");
  }
}

async function updateMember(actor: MemberRow, body: Record<string, unknown>) {
  const id = optionalUuid(body.id, "id");
  if (!id) throw new HttpError(422, "invalid_id");
  const target = await loadMember(id);
  if (target.id === actor.id) throw new HttpError(403, "cannot_edit_self");

  const me = placementOf(actor);
  if (!canManage(me, placementOf(target))) throw new HttpError(403, "forbidden");

  const fields = (typeof body.fields === "object" && body.fields !== null ? body.fields : {}) as Record<string, unknown>;
  const fullNameEn = requireString(fields.fullNameEn, "name");
  const fullNameAr = optionalString(fields.fullNameAr);
  const role = parseAssignableRole(requireString(fields.role, "role"));
  if (!role || !assignableRolesBelow(actor.role).includes(role)) throw new HttpError(403, "forbidden_role");
  if (fields.status !== "Active" && fields.status !== "Suspended") throw new HttpError(422, "invalid_status");

  const next: Placement = {
    role,
    companyId: optionalUuid(fields.companyId, "company"),
    branchId: optionalUuid(fields.branchId, "branch"),
    teamId: optionalUuid(fields.teamId, "team"),
  };
  const missing = placementError(next);
  if (missing) throw new HttpError(422, missing);
  await assertPlacementExists(next);
  if (!canManage(me, next)) throw new HttpError(403, "out_of_scope");

  const { error } = await db
    .from("members")
    .update({
      full_name_en: fullNameEn,
      full_name_ar: fullNameAr,
      role: next.role,
      status: fields.status,
      company_id: next.companyId,
      branch_id: next.branchId,
      team_id: next.teamId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
  return { member: toMemberDto(await loadMember(id), true) };
}

async function removeMember(actor: MemberRow, body: Record<string, unknown>) {
  const id = optionalUuid(body.id, "id");
  if (!id) throw new HttpError(422, "invalid_id");
  const target = await loadMember(id);
  if (target.id === actor.id) throw new HttpError(403, "cannot_edit_self");
  if (!canManage(placementOf(actor), placementOf(target))) throw new HttpError(403, "forbidden");
  const { error } = await db.from("members").delete().eq("id", id);
  if (error) throw error;
  return { ok: true };
}

async function createCompany(actor: MemberRow, body: Record<string, unknown>) {
  if (!isPlatformRole(actor.role)) throw new HttpError(403, "forbidden");
  const name = requireString(body.name, "company");
  const { data, error } = await db.from("companies").insert({ name }).select("id, name").maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(422, "invalid_company");
  return { company: data };
}

async function updateProfile(actor: MemberRow, body: Record<string, unknown>) {
  const fields = (typeof body.fields === "object" && body.fields !== null ? body.fields : {}) as Record<string, unknown>;
  const fullNameEn = requireString(fields.fullNameEn, "name");
  const fullNameAr = optionalString(fields.fullNameAr);
  const phone = optionalString(fields.phone);
  if (phone && !/^[+0-9 ()-]{7,24}$/.test(phone)) throw new HttpError(422, "invalid_phone");
  const { error } = await db
    .from("members")
    .update({ full_name_en: fullNameEn, full_name_ar: fullNameAr, phone, updated_at: new Date().toISOString() })
    .eq("id", actor.id);
  if (error) throw error;
  return { member: toMemberDto(await loadMember(actor.id), false) };
}

async function finishPasswordChange(actor: MemberRow) {
  const { error } = await db
    .from("members")
    .update({ must_change_password: false, updated_at: new Date().toISOString() })
    .eq("id", actor.id);
  if (error) throw error;
  return { ok: true };
}
