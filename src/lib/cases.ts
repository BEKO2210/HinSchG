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

// --- Stufe 2 (Ende-zu-Ende) --------------------------------------------------
// Reservierte Empfaenger-IDs in den Schluessel-Wraps.
export const RECIPIENT_RECOVERY = 'RECOVERY';
export const RECIPIENT_WHISTLEBLOWER = 'WB';

const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/** Eingereichte, bereits clientseitig E2E-verschluesselte Meldung (Stufe 2). */
export interface E2eSubmission {
  category?: string;
  tokenLookup: string; // clientseitig berechneter Hash (Server sieht den Token nie)
  tokenHash: string; // zweiter clientseitiger Hash (erfuellt @unique/not-null)
  wbPublicKey: string; // aus dem Token abgeleiteter Public Key des Hinweisgebers
  payload: { nonce: string; content: string }; // secretbox(Inhalt)
  wraps: Record<string, string>; // EmpfaengerID -> Sealed-Box(Inhaltsschluessel)
}

function isB64(value: unknown, maxLen: number): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= maxLen && B64_RE.test(value)
  );
}

/**
 * Validiert eine clientseitig verschluesselte Stufe-2-Meldung (Shape, Base64,
 * Pflicht-Empfaenger). Die kryptografische Korrektheit kann der Server nicht
 * pruefen — er sieht nie Klartext oder Token. Die Zuordnung der Wrap-IDs zu
 * echten Bearbeiter-IDs erfolgt in der Route (DB).
 */
export function validateE2eSubmission(
  raw: unknown,
): { ok: true; value: E2eSubmission } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Ungültige Anfrage.' };
  }
  const b = raw as Record<string, unknown>;

  const tokenLookup = typeof b.tokenLookup === 'string' ? b.tokenLookup.trim() : '';
  const tokenHash = typeof b.tokenHash === 'string' ? b.tokenHash.trim() : '';
  if (tokenLookup.length < 16 || tokenLookup.length > 512) {
    return { ok: false, error: 'Ungültiger tokenLookup.' };
  }
  if (tokenHash.length < 16 || tokenHash.length > 512) {
    return { ok: false, error: 'Ungültiger tokenHash.' };
  }
  if (!isB64(b.wbPublicKey, 64)) {
    return { ok: false, error: 'Ungültiger wbPublicKey.' };
  }

  const payload = b.payload as Record<string, unknown> | undefined;
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !isB64(payload.nonce, 128) ||
    !isB64(payload.content, 1_000_000)
  ) {
    return { ok: false, error: 'Ungültiger payload.' };
  }

  const wraps = b.wraps as Record<string, unknown> | undefined;
  if (typeof wraps !== 'object' || wraps === null) {
    return { ok: false, error: 'Ungültige wraps.' };
  }
  const entries = Object.entries(wraps);
  if (entries.length < 3 || entries.length > 200) {
    return { ok: false, error: 'Ungültige Empfängeranzahl.' };
  }
  for (const [id, val] of entries) {
    if (!id || id.length > 64 || !isB64(val, 2048)) {
      return { ok: false, error: 'Ungültiger Schlüssel-Wrap.' };
    }
  }
  if (!(RECIPIENT_RECOVERY in wraps) || !(RECIPIENT_WHISTLEBLOWER in wraps)) {
    return { ok: false, error: 'Recovery- und Hinweisgeber-Empfänger sind erforderlich.' };
  }

  let category: string | undefined;
  const rawCategory = typeof b.category === 'string' ? b.category.trim() : '';
  if (rawCategory) {
    if (!CATEGORY_VALUES.has(rawCategory)) {
      return { ok: false, error: 'Unbekannte Kategorie.' };
    }
    category = rawCategory;
  }

  const value: E2eSubmission = {
    tokenLookup,
    tokenHash,
    wbPublicKey: b.wbPublicKey as string,
    payload: { nonce: payload.nonce as string, content: payload.content as string },
    wraps: wraps as Record<string, string>,
  };
  if (category) value.category = category;
  return { ok: true, value };
}

/** Clientseitig verschluesselte Stufe-2-Nachricht (Multi-Recipient). */
export interface E2eMessage {
  payload: { nonce: string; content: string };
  wraps: Record<string, string>;
}

/**
 * Validiert eine E2E-Nachricht (Antwort der Meldestelle bzw. des Hinweisgebers):
 * Payload + Schluessel-Wraps. Pflicht-Empfaenger RECOVERY und WB.
 */
export function validateE2eMessage(
  raw: unknown,
): { ok: true; value: E2eMessage } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Ungültige Anfrage.' };
  }
  const b = raw as Record<string, unknown>;
  const payload = b.payload as Record<string, unknown> | undefined;
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !isB64(payload.nonce, 128) ||
    !isB64(payload.content, 1_000_000)
  ) {
    return { ok: false, error: 'Ungültiger payload.' };
  }
  const wraps = b.wraps as Record<string, unknown> | undefined;
  if (typeof wraps !== 'object' || wraps === null) {
    return { ok: false, error: 'Ungültige wraps.' };
  }
  const entries = Object.entries(wraps);
  if (entries.length < 3 || entries.length > 200) {
    return { ok: false, error: 'Ungültige Empfängeranzahl.' };
  }
  for (const [id, val] of entries) {
    if (!id || id.length > 64 || !isB64(val, 2048)) {
      return { ok: false, error: 'Ungültiger Schlüssel-Wrap.' };
    }
  }
  if (!(RECIPIENT_RECOVERY in wraps) || !(RECIPIENT_WHISTLEBLOWER in wraps)) {
    return { ok: false, error: 'Recovery- und Hinweisgeber-Empfänger sind erforderlich.' };
  }
  return {
    ok: true,
    value: {
      payload: { nonce: payload.nonce as string, content: payload.content as string },
      wraps: wraps as Record<string, string>,
    },
  };
}

// --- Dateianhaenge (Stufe 2, Ende-zu-Ende) -----------------------------------
// Erlaubte MIME-Typen (Whitelist). Bewusst eng: gaengige Dokument-/Bildformate,
// kein HTML/SVG/aktive Inhalte (XSS), keine ausfuehrbaren Typen.
export const ALLOWED_ATTACHMENT_MIME_TYPES: readonly string[] = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
] as const;

const ALLOWED_MIME_SET = new Set(ALLOWED_ATTACHMENT_MIME_TYPES);

/** Maximale Klartext-Groesse eines Anhangs (vor Verschluesselung): 10 MiB. */
export const ATTACHMENT_MAX_PLAINTEXT_BYTES = 10 * 1024 * 1024;
/** Obergrenze fuer das Ciphertext-Feld (Base64 + Overhead): ~15 MiB. */
export const ATTACHMENT_MAX_CIPHERTEXT_CHARS = 15 * 1024 * 1024;
/** Maximale Anzahl Anhaenge pro Upload-Vorgang. */
export const ATTACHMENT_MAX_PER_REQUEST = 5;

/** Ist der MIME-Typ erlaubt (Whitelist)? */
export function isAllowedAttachmentMime(value: unknown): value is string {
  return typeof value === 'string' && ALLOWED_MIME_SET.has(value);
}

/** Clientseitig verschluesselter Anhang (Multi-Recipient, Stufe 2). */
export interface E2eAttachment {
  mimeType: string;
  /** secretbox(Datei) als {nonce, content} */
  blob: { nonce: string; content: string };
  /** secretbox(Dateiname) als {nonce, content} */
  filename: { nonce: string; content: string };
  /** EmpfaengerID -> Sealed-Box(Inhaltsschluessel) */
  wraps: Record<string, string>;
  /** Groesse des Ciphertexts (Server-Plausibilitaet, kein Klartextmass) */
  sizeBytes: number;
}

function isSecretbox(
  value: unknown,
  maxContent: number,
): value is { nonce: string; content: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return isB64(v.nonce, 128) && isB64(v.content, maxContent);
}

/**
 * Validiert einen clientseitig verschluesselten Anhang (Shape, MIME-Whitelist,
 * Groessenlimit, Pflicht-Empfaenger). Der Server sieht nie Klartext; die
 * tatsaechliche Datei wird im Browser ver-/entschluesselt.
 */
export function validateE2eAttachment(
  raw: unknown,
): { ok: true; value: E2eAttachment } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Ungültiger Anhang.' };
  }
  const b = raw as Record<string, unknown>;

  if (!isAllowedAttachmentMime(b.mimeType)) {
    return { ok: false, error: 'Dieser Dateityp ist nicht erlaubt.' };
  }
  if (!isSecretbox(b.blob, ATTACHMENT_MAX_CIPHERTEXT_CHARS)) {
    return { ok: false, error: 'Ungültiger Datei-Inhalt.' };
  }
  if (!isSecretbox(b.filename, 4096)) {
    return { ok: false, error: 'Ungültiger Dateiname.' };
  }
  const sizeBytes = typeof b.sizeBytes === 'number' ? b.sizeBytes : NaN;
  if (
    !Number.isInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > ATTACHMENT_MAX_CIPHERTEXT_CHARS
  ) {
    return { ok: false, error: 'Ungültige Dateigröße.' };
  }

  const wraps = b.wraps as Record<string, unknown> | undefined;
  if (typeof wraps !== 'object' || wraps === null) {
    return { ok: false, error: 'Ungültige Schlüssel-Wraps.' };
  }
  const entries = Object.entries(wraps);
  if (entries.length < 3 || entries.length > 200) {
    return { ok: false, error: 'Ungültige Empfängeranzahl.' };
  }
  for (const [id, val] of entries) {
    if (!id || id.length > 64 || !isB64(val, 2048)) {
      return { ok: false, error: 'Ungültiger Schlüssel-Wrap.' };
    }
  }
  if (!(RECIPIENT_RECOVERY in wraps) || !(RECIPIENT_WHISTLEBLOWER in wraps)) {
    return { ok: false, error: 'Recovery- und Hinweisgeber-Empfänger sind erforderlich.' };
  }

  return {
    ok: true,
    value: {
      mimeType: b.mimeType,
      blob: {
        nonce: (b.blob as { nonce: string }).nonce,
        content: (b.blob as { content: string }).content,
      },
      filename: {
        nonce: (b.filename as { nonce: string }).nonce,
        content: (b.filename as { content: string }).content,
      },
      wraps: wraps as Record<string, string>,
      sizeBytes,
    },
  };
}
