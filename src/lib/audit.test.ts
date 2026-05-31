import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS, isAuditAction } from './audit';

describe('isAuditAction', () => {
  it('akzeptiert alle definierten Aktionen', () => {
    for (const action of AUDIT_ACTIONS) {
      expect(isAuditAction(action)).toBe(true);
    }
  });

  it('lehnt unbekannte Werte und Nicht-Strings ab', () => {
    expect(isAuditAction('DROP_TABLE')).toBe(false);
    expect(isAuditAction('case_created')).toBe(false); // case-sensitiv
    expect(isAuditAction(undefined)).toBe(false);
    expect(isAuditAction(null)).toBe(false);
    expect(isAuditAction(123)).toBe(false);
  });
});
