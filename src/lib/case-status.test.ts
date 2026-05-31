import { describe, expect, it } from 'vitest';
import {
  CASE_STATUSES,
  SEVERITIES,
  caseStatusLabel,
  isCaseStatus,
  isSeverity,
  severityLabel,
} from './case-status';

describe('isCaseStatus', () => {
  it('akzeptiert alle definierten Status', () => {
    for (const status of CASE_STATUSES) {
      expect(isCaseStatus(status)).toBe(true);
    }
  });

  it('lehnt unbekannte Werte und Nicht-Strings ab', () => {
    expect(isCaseStatus('UNKNOWN')).toBe(false);
    expect(isCaseStatus('new')).toBe(false); // case-sensitiv
    expect(isCaseStatus(undefined)).toBe(false);
    expect(isCaseStatus(42)).toBe(false);
    expect(isCaseStatus(null)).toBe(false);
  });
});

describe('isSeverity', () => {
  it('akzeptiert alle definierten Schweregrade', () => {
    for (const severity of SEVERITIES) {
      expect(isSeverity(severity)).toBe(true);
    }
  });

  it('lehnt unbekannte Werte und Nicht-Strings ab', () => {
    expect(isSeverity('EXTREME')).toBe(false);
    expect(isSeverity('low')).toBe(false);
    expect(isSeverity(undefined)).toBe(false);
    expect(isSeverity({})).toBe(false);
  });
});

describe('caseStatusLabel', () => {
  it('liefert das deutsche Label für bekannte Status', () => {
    expect(caseStatusLabel('NEW')).toBe('Eingegangen');
    expect(caseStatusLabel('CLOSED')).toBe('Abgeschlossen');
  });

  it('fällt für unbekannte Status auf den Rohwert zurück', () => {
    expect(caseStatusLabel('SOMETHING_ELSE')).toBe('SOMETHING_ELSE');
  });
});

describe('severityLabel', () => {
  it('liefert das deutsche Label für bekannte Schweregrade', () => {
    expect(severityLabel('UNSET')).toBe('Nicht gesetzt');
    expect(severityLabel('CRITICAL')).toBe('Kritisch');
  });

  it('fällt für unbekannte Schweregrade auf den Rohwert zurück', () => {
    expect(severityLabel('SOMETHING_ELSE')).toBe('SOMETHING_ELSE');
  });
});
