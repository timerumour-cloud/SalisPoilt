import * as XLSX from 'xlsx';
import type { RosterImportRow, RosterStatus } from '@/features/roster/rosterApi';

const ROSTER_SHEET = 'Employees';
const FIRST_DATA_LINE = 2;

export interface RosterFileRow {
  row: RosterImportRow;
  password: string | null;
}

function findColumn(record: Record<string, unknown>, header: string): unknown {
  const key = Object.keys(record).find((name) => name.trim().toLowerCase() === header.toLowerCase());
  return key === undefined ? undefined : record[key];
}

function cell(record: Record<string, unknown>, header: string): string {
  const value = findColumn(record, header);
  return value === undefined || value === null ? '' : String(value).trim();
}

// Dashes in the sheet mean "no company, branch or team" (the platform row uses an em dash).
function optionalCell(record: Record<string, unknown>, header: string): string | null {
  const value = cell(record, header);
  return value && !/^[—–-]/.test(value) ? value : null;
}

function passwordCell(record: Record<string, unknown>): string | null {
  const value = findColumn(record, 'Password');
  return value === undefined || value === null || String(value) === '' ? null : String(value);
}

function firstCell(record: Record<string, unknown>, ...headers: string[]): string {
  for (const header of headers) {
    const value = cell(record, header);
    if (value) return value;
  }
  return '';
}

function optionalFirstCell(record: Record<string, unknown>, ...headers: string[]): string | null {
  for (const header of headers) {
    const value = optionalCell(record, header);
    if (value) return value;
  }
  return null;
}

function toStatus(value: string): RosterStatus {
  return /suspended|inactive|غير نشط|موقوف/i.test(value) ? 'Suspended' : 'Active';
}

function toRosterRow(record: Record<string, unknown>, line: number): RosterFileRow | null {
  const fullNameEn = firstCell(record, 'Full Name (EN)', 'Full Name', 'الاسم (EN)');
  const email = cell(record, 'Email');
  if (!fullNameEn && !email) return null;
  return {
    row: {
      line,
      fullNameEn,
      fullNameAr: optionalFirstCell(record, 'الاسم (AR)', 'Full Name (AR)'),
      role: firstCell(record, 'Role', 'الرتبة'),
      company: optionalFirstCell(record, 'Company', 'الشركة'),
      branch: optionalFirstCell(record, 'Branch', 'الفرع'),
      team: optionalFirstCell(record, 'Team', 'الفريق'),
      userId: firstCell(record, 'User ID', 'UserID', 'User Id', 'رقم المستخدم', 'معرف المستخدم'),
      email,
      status: toStatus(cell(record, 'Status')),
    },
    password: passwordCell(record),
  };
}

export async function readRosterFile(file: File): Promise<RosterFileRow[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheetName =
    workbook.SheetNames.find((name) => name.trim().toLowerCase() === ROSTER_SHEET.toLowerCase()) ??
    workbook.SheetNames[0];
  const sheet = sheetName === undefined ? undefined : workbook.Sheets[sheetName];
  if (!sheet) return [];
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  return records.flatMap((record, index) => {
    const parsed = toRosterRow(record, index + FIRST_DATA_LINE);
    return parsed ? [parsed] : [];
  });
}
