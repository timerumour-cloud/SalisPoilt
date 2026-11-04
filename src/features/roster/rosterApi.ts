import { currentIdToken } from '@/shared/auth/firebase';

export const ROLE_CODES = [
  'OWNER',
  'SUPER_ADMIN',
  'COMPANY_ADMIN',
  'BRANCH_MANAGER',
  'TEAM_LEADER',
  'EMPLOYEE',
] as const;

export type RosterRole = (typeof ROLE_CODES)[number];
export type RosterStatus = 'Active' | 'Suspended';

export interface RosterMember {
  id: string;
  email: string;
  fullNameEn: string;
  fullNameAr: string | null;
  userId: string;
  phone: string | null;
  rosterOrder: number | null;
  role: RosterRole;
  status: RosterStatus;
  mustChangePassword: boolean;
  companyId: string | null;
  companyName: string | null;
  branchId: string | null;
  branchName: string | null;
  teamId: string | null;
  teamName: string | null;
  canManage: boolean;
}

export interface RosterLookups {
  companies: { id: string; name: string }[];
  branches: { id: string; company_id: string; name: string }[];
  teams: { id: string; branch_id: string; name: string }[];
}

export interface RosterListResponse {
  members: RosterMember[];
  lookups: RosterLookups;
  assignableRoles: RosterRole[];
}

export interface ProfileFields {
  fullNameEn: string;
  fullNameAr: string | null;
  phone: string | null;
}

export interface RosterMemberFields {
  fullNameEn: string;
  fullNameAr: string | null;
  role: RosterRole;
  status: RosterStatus;
  companyId: string | null;
  branchId: string | null;
  teamId: string | null;
}

export interface RosterImportRow {
  line: number;
  fullNameEn: string;
  fullNameAr: string | null;
  role: string;
  company: string | null;
  branch: string | null;
  team: string | null;
  userId: string;
  email: string;
  status: RosterStatus;
  password?: string;
}

export interface RosterValidationIssue {
  line: number;
  code: string;
}

export interface RosterImportPreview {
  toCreate: number;
  toUpdate: number;
}

export interface RosterImportResult {
  created: number;
  updated: number;
}

export class RosterError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, details: unknown = null) {
    super(code);
    this.name = 'RosterError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const ROSTER_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/roster`;

async function callRoster<T>(body: Record<string, unknown>): Promise<T> {
  const token = await currentIdToken();
  const response = await fetch(ROSTER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);
  const failure = (typeof payload === 'object' && payload !== null ? payload : {}) as {
    error?: unknown;
    details?: unknown;
  };
  if (!response.ok) {
    const code = typeof failure.error === 'string' ? failure.error : 'request_failed';
    throw new RosterError(response.status, code, failure.details ?? null);
  }
  if (typeof payload !== 'object' || payload === null) throw new RosterError(response.status, 'invalid_response');
  return payload as T;
}

export async function fetchCurrentMember(): Promise<RosterMember> {
  const { member } = await callRoster<{ member: RosterMember }>({ action: 'me' });
  return member;
}

export async function updateProfile(fields: ProfileFields): Promise<RosterMember> {
  const { member } = await callRoster<{ member: RosterMember }>({ action: 'profile', fields });
  return member;
}

export async function acknowledgePasswordChange(): Promise<void> {
  await callRoster<{ ok: true }>({ action: 'passwordChanged' });
}

export async function fetchRoster(): Promise<RosterListResponse> {
  const response = await callRoster<RosterListResponse>({ action: 'list' });
  if (!Array.isArray(response.members) || !Array.isArray(response.assignableRoles)) {
    throw new RosterError(200, 'invalid_response');
  }
  return response;
}

export async function createRosterCompany(name: string): Promise<{ id: string; name: string }> {
  const response = await callRoster<{ company: { id: string; name: string } }>({ action: 'createCompany', name });
  return response.company;
}

export async function updateRosterMember(id: string, fields: RosterMemberFields): Promise<void> {
  await callRoster<{ member: RosterMember }>({ action: 'update', id, fields });
}

export async function removeRosterMember(id: string): Promise<void> {
  await callRoster<{ ok: true }>({ action: 'remove', id });
}

export async function previewRosterImport(rows: RosterImportRow[]): Promise<RosterImportPreview> {
  return callRoster<RosterImportPreview>({ action: 'import', rows, commit: false });
}

export async function commitRosterImport(rows: RosterImportRow[]): Promise<RosterImportResult> {
  return callRoster<RosterImportResult>({ action: 'import', rows, commit: true });
}
