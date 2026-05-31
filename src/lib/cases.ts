// HinSchG — Gemeinsame Logik für die öffentliche Meldestrecke
//
// Kategorien + Validierung der Formulareingaben. Bewusst frei von Prisma/IO,
// damit die Validierung pur und unit-testbar bleibt.

export interface ReportCategory {
  value: string;
  label: string;
}

// Kategorien orientiert an typischen HinSchG-Meldesachverhalten. Der Wert ist
// ein stabiler Code, das Label wird im Formular angezeigt.
export const REPORT_CATEGORIES: readonly ReportCategory[] = [
  { value: 'corruption', label: 'Korruption & Bestechung' },
  { value: 'fraud', label: 'Betrug, Untreue & Vermögensdelikte' },
  { value: 'discrimination', label: 'Diskriminierung & Belästigung' },
  { value: 'data_protection', label: 'Datenschutz- & IT-Sicherheitsverstöße' },
  { value: 'environment', label: 'Umwelt-, Gesundheits- & Verbraucherschutz' },
  { value: 'compliance', label: 'Verstöße gegen Gesetze / interne Richtlinien' },
  { value: 'other', label: 'Sonstiges' },
] as const;

const CATEGORY_VALUES = new Set(REPORT_CATEGORIES.map((c) => c.value));

const CATEGORY_LABELS = new Map(REPORT_CATEGORIES.map((c) => [c.value, c.label]));

/** Anzeigename einer Kategorie (oder „Ohne Kategorie", wenn keine gesetzt ist). */
export function categoryLabel(value: string | null | undefined): string {
  if (!value) {
    return 'Ohne Kategorie';
  }
  return CATEGORY_LABELS.get(value) ?? value;
}

// Längenbegrenzungen schützen vor Missbrauch und übergroßen Payloads.
export const DESCRIPTION_MAX = 20000;
export const CONTACT_MAX = 1000;

/** Inhalt einer validierten Meldung (vor Verschlüsselung). */
export interface ReportInput {
  category?: string;
  description: string;
  incidentDate?: string; // ISO-Datum (YYYY-MM-DD)
  contact?: string;
}

export type ValidationResult = { ok: true; value: ReportInput } | { ok: false; error: string };

function asTrimmedString(input: unknown): string | undefined {
  if (typeof input !== 'string') {
    return undefined;
  }
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Validiert und normalisiert die rohen Formular-/JSON-Daten einer Meldung.
 * Pflichtfeld ist ausschließlich die Beschreibung — niemals Identitätsfelder.
 */
export function validateReportInput(raw: unknown): ValidationResult {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Ungültige Anfrage.' };
  }
  const body = raw as Record<string, unknown>;

  const description = asTrimmedString(body.description);
  if (!description) {
    return { ok: false, error: 'Eine Beschreibung des Sachverhalts ist erforderlich.' };
  }
  if (description.length > DESCRIPTION_MAX) {
    return {
      ok: false,
      error: `Die Beschreibung darf höchstens ${DESCRIPTION_MAX} Zeichen lang sein.`,
    };
  }

  let category: string | undefined;
  const rawCategory = asTrimmedString(body.category);
  if (rawCategory) {
    if (!CATEGORY_VALUES.has(rawCategory)) {
      return { ok: false, error: 'Unbekannte Kategorie.' };
    }
    category = rawCategory;
  }

  let incidentDate: string | undefined;
  const rawDate = asTrimmedString(body.incidentDate);
  if (rawDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      return { ok: false, error: 'Der Vorfallszeitpunkt muss im Format JJJJ-MM-TT vorliegen.' };
    }
    const parsed = new Date(`${rawDate}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: 'Der Vorfallszeitpunkt ist kein gültiges Datum.' };
    }
    // Heute (UTC) als obere Grenze; Zukunft ist nicht plausibel.
    const todayUtc = new Date();
    todayUtc.setUTCHours(23, 59, 59, 999);
    if (parsed.getTime() > todayUtc.getTime()) {
      return { ok: false, error: 'Der Vorfallszeitpunkt darf nicht in der Zukunft liegen.' };
    }
    incidentDate = rawDate;
  }

  const contact = asTrimmedString(body.contact);
  if (contact && contact.length > CONTACT_MAX) {
    return {
      ok: false,
      error: `Die Kontaktangabe darf höchstens ${CONTACT_MAX} Zeichen lang sein.`,
    };
  }

  const value: ReportInput = { description };
  if (category) value.category = category;
  if (incidentDate) value.incidentDate = incidentDate;
  if (contact) value.contact = contact;
  return { ok: true, value };
}

/** Setzt die HinSchG-Fristen relativ zum Eingangszeitpunkt. */
export function computeDeadlines(now: Date = new Date()): {
  deadlineAck: Date;
  deadlineFeedback: Date;
} {
  const deadlineAck = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 Tage
  const deadlineFeedback = new Date(now);
  deadlineFeedback.setMonth(deadlineFeedback.getMonth() + 3); // +3 Monate
  return { deadlineAck, deadlineFeedback };
}
