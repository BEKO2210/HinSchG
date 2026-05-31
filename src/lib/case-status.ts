// HinSchG — Anzeigetexte fuer Fallstatus / Schweregrad / Nachrichtenrichtung.
// Zentral, damit Postfach und (spaeter) Dashboard dieselben Bezeichnungen nutzen.

export const CASE_STATUS_LABELS: Record<string, string> = {
  NEW: 'Eingegangen',
  IN_REVIEW: 'In Pruefung',
  INFO_REQUESTED: 'Rueckfrage offen',
  ACTION_TAKEN: 'Massnahmen ergriffen',
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

export function caseStatusLabel(status: string): string {
  return CASE_STATUS_LABELS[status] ?? status;
}

export function severityLabel(severity: string): string {
  return SEVERITY_LABELS[severity] ?? severity;
}
