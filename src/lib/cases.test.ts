import { describe, expect, it } from 'vitest';
import { computeDeadlines, validateReportInput } from './cases';

describe('validateReportInput', () => {
  it('akzeptiert eine gueltige Meldung und normalisiert die Felder', () => {
    const result = validateReportInput({
      category: 'fraud',
      description: '  Es gibt einen Verdacht auf Untreue.  ',
      incidentDate: '2024-01-15',
      contact: '  anon@example.org ',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        category: 'fraud',
        description: 'Es gibt einen Verdacht auf Untreue.',
        incidentDate: '2024-01-15',
        contact: 'anon@example.org',
      });
    }
  });

  it('verlangt eine Beschreibung', () => {
    expect(validateReportInput({ description: '   ' }).ok).toBe(false);
    expect(validateReportInput({}).ok).toBe(false);
  });

  it('erlaubt eine Meldung ohne optionale Felder', () => {
    const result = validateReportInput({ description: 'Nur Text.' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ description: 'Nur Text.' });
    }
  });

  it('lehnt unbekannte Kategorien ab', () => {
    expect(validateReportInput({ description: 'x', category: 'nicht-existent' }).ok).toBe(false);
  });

  it('lehnt ein ungueltiges Datumsformat ab', () => {
    expect(validateReportInput({ description: 'x', incidentDate: '15.01.2024' }).ok).toBe(false);
  });

  it('lehnt ein Datum in der Zukunft ab', () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(validateReportInput({ description: 'x', incidentDate: future }).ok).toBe(false);
  });

  it('lehnt eine zu lange Beschreibung ab', () => {
    expect(validateReportInput({ description: 'a'.repeat(20001) }).ok).toBe(false);
  });

  it('lehnt eine ungueltige Anfrage (kein Objekt) ab', () => {
    expect(validateReportInput(null).ok).toBe(false);
    expect(validateReportInput('text').ok).toBe(false);
  });
});

describe('computeDeadlines', () => {
  it('setzt +7 Tage und +3 Monate', () => {
    const now = new Date('2024-01-15T12:00:00.000Z');
    const { deadlineAck, deadlineFeedback } = computeDeadlines(now);
    expect(deadlineAck.toISOString()).toBe('2024-01-22T12:00:00.000Z');
    expect(deadlineFeedback.toISOString()).toBe('2024-04-15T12:00:00.000Z');
  });
});
