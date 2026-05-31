// HinSchG — Katalog der Audit-Aktionen (für Filter/Anzeige)

export const AUDIT_ACTIONS = [
  'CASE_CREATED',
  'CASE_VIEWED',
  'ACK_SENT',
  'STATUS_CHANGED',
  'SEVERITY_CHANGED',
  'OFFICE_MESSAGE_ADDED',
  'WB_MESSAGE_ADDED',
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  '2FA_FAILED',
  'HANDLER_CREATED',
  'CASE_PURGED',
  'E2E_RECOVERY_SET',
  'HANDLER_KEY_ENROLLED',
  'CASE_RECOVERED',
  'HANDLER_RESET',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export function isAuditAction(value: unknown): value is AuditAction {
  return typeof value === 'string' && (AUDIT_ACTIONS as readonly string[]).includes(value);
}
