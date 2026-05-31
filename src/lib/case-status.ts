// HinSchG — Anzeigetexte für Fallstatus / Schweregrad / Nachrichtenrichtung.
// Zentral, damit Postfach und (später) Dashboard dieselben Bezeichnungen nutzen.

export const CASE_STATUS_LABELS: Record<string, string> = {
  NEW: 'Eingegangen',
  IN_REVIEW: 'In Prüfung',
  INFO_REQUESTED: 'Rückfrage offen',
  ACTION_TAKEN: 'Maßnahmen ergriffen',
  CLOSED: 'Abgeschlossen',
  REJECTED: 'Abgelehnt',
};

export const SEVERITY_LABELS: Record<string, string> = {
  UNSET: 'Nicht gesetzt',
  LOW: 'Niedrig',
  MEDIUM: 'Mittel',
  HIGH: 'Hoch',
  CRITICAL: 'Kritisch',
};

// Geordnete Werte für Auswahlfelder (entsprechen den Prisma-Enums).
export const CASE_STATUSES = [
  'NEW',
  'IN_REVIEW',
  'INFO_REQUESTED',
  'ACTION_TAKEN',
  'CLOSED',
  'REJECTED',
] as const;

export const SEVERITIES = ['UNSET', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export type CaseStatusValue = (typeof CASE_STATUSES)[number];
export type SeverityValue = (typeof SEVERITIES)[number];

export function isCaseStatus(value: unknown): value is CaseStatusValue {
  return typeof value === 'string' && (CASE_STATUSES as readonly string[]).includes(value);
}

export function isSeverity(value: unknown): value is SeverityValue {
  return typeof value === 'string' && (SEVERITIES as readonly string[]).includes(value);
}

export function caseStatusLabel(status: string): string {
  return CASE_STATUS_LABELS[status] ?? status;
}

export function severityLabel(severity: string): string {
  return SEVERITY_LABELS[severity] ?? severity;
}
