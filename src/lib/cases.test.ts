import { describe, expect, it } from 'vitest';
import {
  categoryLabel,
  computeDeadlines,
  isAllowedAttachmentMime,
  validateE2eAttachment,
  validateE2eMessage,
  validateE2eSubmission,
  validateReportInput,
} from './cases';

const validE2e = {
  encryptionVersion: 2,
  category: 'fraud',
  tokenLookup: 'a'.repeat(43),
  tokenHash: 'b'.repeat(43),
  wbPublicKey: 'Zm9vYmFyZm9vYmFyZm9vYmFyZm9vYmFyMzJieXRl', // 32 Byte base64
  payload: { nonce: 'bm9uY2Vub25jZQ==', content: 'Y29udGVudA==' },
  wraps: { RECOVERY: 'd3JhcA==', WB: 'd3JhcA==', someHandlerId: 'd3JhcA==' },
};

// Prüft, dass eine Validierung mit der erwarteten Fehlermeldung scheitert.
// Killt StringLiteral-Mutanten an den Fehlertexten (Mutation-Testing).
function expectErr(result: { ok: boolean; error?: string }, msg: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toBe(msg);
}

describe('validateE2eSubmission', () => {
  it('akzeptiert eine gültige Stufe-2-Einreichung', () => {
    const r = validateE2eSubmission(validE2e);
    expect(r.ok).toBe(true);
  });

  it('verlangt RECOVERY- und WB-Empfänger', () => {
    const msg = 'Recovery- und Hinweisgeber-Empfänger sind erforderlich.';
    expectErr(
      validateE2eSubmission({
        ...validE2e,
        wraps: { WB: 'd3JhcA==', a: 'd3JhcA==', b: 'd3JhcA==' },
      }),
      msg,
    );
    expectErr(
      validateE2eSubmission({
        ...validE2e,
        wraps: { RECOVERY: 'd3JhcA==', a: 'd3JhcA==', b: 'd3JhcA==' },
      }),
      msg,
    );
  });

  it('lehnt einen ungültigen wbPublicKey ab', () => {
    expectErr(
      validateE2eSubmission({ ...validE2e, wbPublicKey: 'nicht base64 !!' }),
      'Ungültiger wbPublicKey.',
    );
  });

  it('lehnt fehlenden payload ab', () => {
    expectErr(
      validateE2eSubmission({ ...validE2e, payload: { nonce: 'x' } }),
      'Ungültiger payload.',
    );
  });

  it('lehnt Nicht-Objekte ab', () => {
    expectErr(validateE2eSubmission(null), 'Ungültige Anfrage.');
    expectErr(validateE2eSubmission('x'), 'Ungültige Anfrage.');
  });

  it('lehnt ungültige tokenLookup/tokenHash ab', () => {
    expectErr(
      validateE2eSubmission({ ...validE2e, tokenLookup: 'kurz' }),
      'Ungültiger tokenLookup.',
    );
    expectErr(validateE2eSubmission({ ...validE2e, tokenHash: 'kurz' }), 'Ungültiger tokenHash.');
    // nicht-string -> ternärer false-Zweig (wird zu '' -> Längen-Check schlägt fehl).
    expectErr(validateE2eSubmission({ ...validE2e, tokenLookup: 123 }), 'Ungültiger tokenLookup.');
    expectErr(validateE2eSubmission({ ...validE2e, tokenHash: 123 }), 'Ungültiger tokenHash.');
  });

  it('lehnt fehlende/ungültige wraps ab', () => {
    expectErr(validateE2eSubmission({ ...validE2e, wraps: null }), 'Ungültige wraps.');
    // zu wenige Empfänger.
    expectErr(
      validateE2eSubmission({ ...validE2e, wraps: { RECOVERY: 'd3JhcA==' } }),
      'Ungültige Empfängeranzahl.',
    );
    // ungültiger Wrap (kein Base64).
    expectErr(
      validateE2eSubmission({
        ...validE2e,
        wraps: { RECOVERY: 'd3JhcA==', WB: 'd3JhcA==', h: '!!' },
      }),
      'Ungültiger Schlüssel-Wrap.',
    );
  });

  it('lehnt eine unbekannte Kategorie ab, erlaubt aber das Weglassen', () => {
    expectErr(
      validateE2eSubmission({ ...validE2e, category: 'nicht-existent' }),
      'Unbekannte Kategorie.',
    );
    const { category: _drop, ...ohneKategorie } = validE2e;
    void _drop;
    expect(validateE2eSubmission(ohneKategorie).ok).toBe(true);
  });
});

describe('validateE2eMessage', () => {
  const validMsg = {
    payload: { nonce: 'bm9uY2Vub25jZQ==', content: 'Y29udGVudA==' },
    wraps: { RECOVERY: 'd3JhcA==', WB: 'd3JhcA==', h_1: 'd3JhcA==' },
  };

  it('akzeptiert eine gültige Nachricht', () => {
    expect(validateE2eMessage(validMsg).ok).toBe(true);
  });

  it('lehnt Nicht-Objekte und kaputten payload ab', () => {
    expect(validateE2eMessage(null).ok).toBe(false);
    expect(validateE2eMessage('x').ok).toBe(false);
    expect(validateE2eMessage({ ...validMsg, payload: { nonce: 'x' } }).ok).toBe(false);
    expect(validateE2eMessage({ ...validMsg, payload: null }).ok).toBe(false);
  });

  it('lehnt ungültige wraps ab', () => {
    expect(validateE2eMessage({ ...validMsg, wraps: null }).ok).toBe(false);
    expect(validateE2eMessage({ ...validMsg, wraps: { RECOVERY: 'd3JhcA==' } }).ok).toBe(false);
    expect(
      validateE2eMessage({ ...validMsg, wraps: { RECOVERY: 'd3JhcA==', WB: 'd3JhcA==', h: '!!' } })
        .ok,
    ).toBe(false);
    // zu lange Empfänger-ID.
    expect(
      validateE2eMessage({
        ...validMsg,
        wraps: { RECOVERY: 'd3JhcA==', WB: 'd3JhcA==', ['x'.repeat(65)]: 'd3JhcA==' },
      }).ok,
    ).toBe(false);
  });

  it('verlangt RECOVERY- und WB-Empfänger', () => {
    expect(
      validateE2eMessage({ ...validMsg, wraps: { WB: 'd3JhcA==', a: 'd3JhcA==', b: 'd3JhcA==' } })
        .ok,
    ).toBe(false);
  });
});

describe('validateReportInput', () => {
  it('akzeptiert eine gültige Meldung und normalisiert die Felder', () => {
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

  it('lehnt ein ungültiges Datumsformat ab', () => {
    expect(validateReportInput({ description: 'x', incidentDate: '15.01.2024' }).ok).toBe(false);
  });

  it('lehnt ein formal korrektes, aber unmögliches Datum ab', () => {
    // Passt auf das Regex-Format, ergibt aber ein ungültiges Datum (NaN).
    expect(validateReportInput({ description: 'x', incidentDate: '2024-13-40' }).ok).toBe(false);
  });

  it('lehnt ein Datum in der Zukunft ab', () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(validateReportInput({ description: 'x', incidentDate: future }).ok).toBe(false);
  });

  it('lehnt eine zu lange Beschreibung ab', () => {
    expect(validateReportInput({ description: 'a'.repeat(20001) }).ok).toBe(false);
  });

  it('lehnt eine zu lange Kontaktangabe ab', () => {
    expect(validateReportInput({ description: 'x', contact: 'a'.repeat(1001) }).ok).toBe(false);
  });

  it('lehnt eine ungültige Anfrage (kein Objekt) ab', () => {
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

describe('categoryLabel', () => {
  it('liefert Label, Fallback-Wert und „Ohne Kategorie"', () => {
    expect(categoryLabel('fraud')).toBe('Betrug, Untreue & Vermögensdelikte');
    expect(categoryLabel('unbekannt')).toBe('unbekannt');
    expect(categoryLabel(null)).toBe('Ohne Kategorie');
    expect(categoryLabel(undefined)).toBe('Ohne Kategorie');
    expect(categoryLabel('')).toBe('Ohne Kategorie');
  });
});

// --- Anhang-Validierung (Stufe 2) -------------------------------------------
describe('validateE2eAttachment', () => {
  const b64 = (n: number) => 'A'.repeat(n);
  const validBox = { nonce: b64(32), content: b64(64) };
  const base = () => ({
    mimeType: 'application/pdf',
    blob: { ...validBox },
    filename: { ...validBox },
    sizeBytes: 64,
    wraps: { RECOVERY: b64(40), WB: b64(40), h_1: b64(40) },
  });

  it('akzeptiert einen gültigen Anhang', () => {
    const r = validateE2eAttachment(base());
    expect(r.ok).toBe(true);
  });

  it('lehnt einen unerlaubten MIME-Typ ab', () => {
    const r = validateE2eAttachment({ ...base(), mimeType: 'image/svg+xml' });
    expect(r.ok).toBe(false);
  });

  it('lehnt fehlende Pflicht-Empfänger (RECOVERY/WB) ab', () => {
    const r = validateE2eAttachment({
      ...base(),
      wraps: { h_1: b64(40), h_2: b64(40), h_3: b64(40) },
    });
    expect(r.ok).toBe(false);
  });

  it('lehnt ungültige Größe ab', () => {
    expect(validateE2eAttachment({ ...base(), sizeBytes: 0 }).ok).toBe(false);
    expect(validateE2eAttachment({ ...base(), sizeBytes: -5 }).ok).toBe(false);
    expect(validateE2eAttachment({ ...base(), sizeBytes: 1.5 }).ok).toBe(false);
    // nicht-numerisch -> NaN-Zweig; zu groß -> Obergrenze.
    expect(validateE2eAttachment({ ...base(), sizeBytes: 'viel' }).ok).toBe(false);
    expect(validateE2eAttachment({ ...base(), sizeBytes: 20 * 1024 * 1024 }).ok).toBe(false);
  });

  it('lehnt kaputten Datei-/Dateinamen-Ciphertext ab', () => {
    expect(validateE2eAttachment({ ...base(), blob: { nonce: '', content: '' } }).ok).toBe(false);
    expect(validateE2eAttachment({ ...base(), blob: null }).ok).toBe(false);
    expect(validateE2eAttachment({ ...base(), filename: null }).ok).toBe(false);
    expect(validateE2eAttachment({ ...base(), filename: { nonce: 'A', content: '' } }).ok).toBe(
      false,
    );
  });

  it('lehnt fehlende/ungültige wraps ab', () => {
    expect(validateE2eAttachment({ ...base(), wraps: null }).ok).toBe(false);
    expect(validateE2eAttachment({ ...base(), wraps: 'x' }).ok).toBe(false);
    // zu wenige Empfänger.
    expect(validateE2eAttachment({ ...base(), wraps: { RECOVERY: b64(40) } }).ok).toBe(false);
    // zu viele Empfänger (> 200).
    const many: Record<string, string> = { RECOVERY: b64(40), WB: b64(40) };
    for (let i = 0; i < 201; i++) many[`h_${i}`] = b64(40);
    expect(validateE2eAttachment({ ...base(), wraps: many }).ok).toBe(false);
    // Empfänger-ID zu lang.
    expect(
      validateE2eAttachment({
        ...base(),
        wraps: { RECOVERY: b64(40), WB: b64(40), ['x'.repeat(65)]: b64(40) },
      }).ok,
    ).toBe(false);
  });

  it('lehnt einen ungültigen Wrap (kein Base64) ab', () => {
    const r = validateE2eAttachment({
      ...base(),
      wraps: { RECOVERY: '!!', WB: b64(40), h_1: b64(40) },
    });
    expect(r.ok).toBe(false);
  });

  it('lehnt Nicht-Objekte ab', () => {
    expect(validateE2eAttachment(null).ok).toBe(false);
    expect(validateE2eAttachment('x').ok).toBe(false);
  });
});

describe('isAllowedAttachmentMime', () => {
  it('erlaubt Whitelist-Typen, lehnt aktive Inhalte ab', () => {
    expect(isAllowedAttachmentMime('application/pdf')).toBe(true);
    expect(isAllowedAttachmentMime('image/png')).toBe(true);
    expect(isAllowedAttachmentMime('image/svg+xml')).toBe(false);
    expect(isAllowedAttachmentMime('text/html')).toBe(false);
    expect(isAllowedAttachmentMime('application/x-msdownload')).toBe(false);
    expect(isAllowedAttachmentMime(undefined)).toBe(false);
  });
});
