// HinSchG — API: Meldung einreichen (öffentlich, kein Login)
//
// Ablauf (siehe ARCHITECTURE.md Abschnitt 5, Stufe 1):
//   1. Eingaben validieren (Pflicht: nur Beschreibung).
//   2. Receipt-Token erzeugen; NUR den Argon2id-Hash speichern.
//   3. Sensiblen Inhalt mit XChaCha20-Poly1305 verschlüsseln.
//   4. HinSchG-Fristen setzen (+7 Tage / +3 Monate).
//   5. AuditLog "CASE_CREATED" ohne PII.
//   6. Klartext-Token EINMALIG zurückgeben — niemals loggen/persistieren.
//
// Es werden bewusst KEINE IP-Adresse und KEIN User-Agent gespeichert.

import { NextResponse } from 'next/server';
import { encryptPayload, generateReceiptToken, hashToken, tokenBlindIndex } from '@/lib/crypto';
import {
  RECIPIENT_RECOVERY,
  RECIPIENT_WHISTLEBLOWER,
  computeDeadlines,
  validateE2eSubmission,
  validateReportInput,
} from '@/lib/cases';
import { prisma } from '@/lib/db';
import { isValidOfficeSlug } from '@/lib/office';
import { clientKeyFromHeaders, rateLimit } from '@/lib/rate-limit';

// Loest die Ziel-Meldestelle auf: mit gueltigem Slug gezielt (Multi-Tenant),
// sonst die Standard-Meldestelle. Ungueltiger/unbekannter Slug -> null.
async function resolveOffice(slug: unknown): Promise<{ id: string } | null> {
  if (typeof slug === 'string' && slug.length > 0) {
    if (!isValidOfficeSlug(slug)) {
      return null;
    }
    return prisma.reportingOffice.findUnique({ where: { slug }, select: { id: true } });
  }
  return prisma.reportingOffice.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
}

// Prisma + node:crypto erfordern die Node.js-Runtime (nicht Edge).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Max. 5 Meldungen pro 10 Minuten je transientem Schlüssel (IP).
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;

// Obergrenze für die Request-Größe (zusätzlich zur Feldvalidierung).
const MAX_BODY_BYTES = 128 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  // --- Rate Limiting (transient, ohne Persistenz) ---------------------------
  const key = clientKeyFromHeaders(request.headers);
  const limit = rateLimit(key, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Zu viele Anfragen. Bitte später erneut versuchen.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  // --- Größenlimit --------------------------------------------------------
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Anfrage zu groß.' }, { status: 413 });
  }

  // --- Body parsen + validieren ---------------------------------------------
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiges JSON.' }, { status: 400 });
  }

  // Stufe 2 (Ende-zu-Ende): Inhalt ist bereits clientseitig verschlüsselt.
  if (
    typeof raw === 'object' &&
    raw !== null &&
    (raw as Record<string, unknown>).encryptionVersion === 2
  ) {
    return handleE2eSubmission(raw);
  }

  const validation = validateReportInput(raw);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const { category, description, incidentDate, contact } = validation.value;

  // --- Ziel-Meldestelle ermitteln (Multi-Tenant, Phase 9b) ------------------
  // Mit officeSlug wird gezielt eine Meldestelle adressiert (/m/[slug]/melden);
  // ohne Slug die Standard-Meldestelle.
  const office = await resolveOffice((raw as Record<string, unknown>).officeSlug);
  if (!office) {
    return NextResponse.json({ error: 'Es ist keine Meldestelle konfiguriert.' }, { status: 503 });
  }

  // --- Token + Verschlüsselung ---------------------------------------------
  const receiptToken = generateReceiptToken();
  const tokenHash = hashToken(receiptToken);
  const tokenLookup = tokenBlindIndex(receiptToken);

  // Sensibler Inhalt wird verschlüsselt abgelegt; die Kategorie ist eine
  // nicht-personenbezogene Klassifizierung und bleibt als Spalte durchsuchbar.
  const encryptedPayload = encryptPayload(
    JSON.stringify({ description, incidentDate: incidentDate ?? null, contact: contact ?? null }),
  );

  const { deadlineAck, deadlineFeedback } = computeDeadlines();

  // --- Persistenz (Case + Audit in einer Transaktion) -----------------------
  try {
    const created = await prisma.$transaction(async (tx) => {
      const newCase = await tx.case.create({
        data: {
          officeId: office.id,
          tokenHash,
          tokenLookup,
          category: category ?? null,
          encryptedPayload,
          deadlineAck,
          deadlineFeedback,
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorType: 'WHISTLEBLOWER',
          action: 'CASE_CREATED',
          caseId: newCase.id,
          officeId: office.id,
          // Bewusst keine PII, kein Token, kein Inhalt — nur die Klassifizierung.
          metadata: { category: category ?? null },
        },
      });
      return newCase;
    });
    void created;
  } catch {
    // Keine Details/Inhalte loggen.
    return NextResponse.json(
      { error: 'Die Meldung konnte nicht gespeichert werden.' },
      { status: 500 },
    );
  }

  // Token wird EINMALIG zurückgegeben und nirgends persistiert/geloggt.
  return NextResponse.json(
    {
      receiptToken,
      deadlineAck: deadlineAck.toISOString(),
      deadlineFeedback: deadlineFeedback.toISOString(),
    },
    { status: 201 },
  );
}

/**
 * Stufe-2-Meldung speichern: Der Inhalt ist bereits clientseitig
 * Ende-zu-Ende-verschlüsselt. Der Server sieht weder Klartext noch Token; er
 * legt nur Ciphertext, Schlüssel-Wraps und den (clientseitig berechneten)
 * Lookup ab. Der Receipt-Token wurde im Browser erzeugt und verbleibt dort.
 */
async function handleE2eSubmission(raw: unknown): Promise<NextResponse> {
  const validation = validateE2eSubmission(raw);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const { category, tokenLookup, tokenHash, wbPublicKey, payload, wraps } = validation.value;

  // Ziel-Meldestelle (Multi-Tenant): zuerst per Slug aufloesen, dann die fuer die
  // Empfaengerpruefung noetigen Felder laden.
  const resolved = await resolveOffice((raw as Record<string, unknown>).officeSlug);
  const office = resolved
    ? await prisma.reportingOffice.findUnique({
        where: { id: resolved.id },
        select: {
          id: true,
          recoveryPublicKey: true,
          handlers: { where: { publicKey: { not: null } }, select: { id: true } },
        },
      })
    : null;
  if (!office) {
    return NextResponse.json({ error: 'Es ist keine Meldestelle konfiguriert.' }, { status: 503 });
  }
  if (!office.recoveryPublicKey || office.handlers.length === 0) {
    return NextResponse.json(
      { error: 'Ende-zu-Ende-Verschlüsselung ist noch nicht eingerichtet.' },
      { status: 409 },
    );
  }

  // Jede Wrap-Empfänger-ID muss RECOVERY, WB oder eine echte Bearbeiter-ID des
  // Office sein; mindestens ein Bearbeiter muss adressiert sein.
  const validIds = new Set<string>([
    RECIPIENT_RECOVERY,
    RECIPIENT_WHISTLEBLOWER,
    ...office.handlers.map((h) => h.id),
  ]);
  let handlerRecipients = 0;
  for (const id of Object.keys(wraps)) {
    if (!validIds.has(id)) {
      return NextResponse.json(
        { error: 'Unbekannter Empfänger im Schlüssel-Wrap.' },
        { status: 400 },
      );
    }
    if (id !== RECIPIENT_RECOVERY && id !== RECIPIENT_WHISTLEBLOWER) {
      handlerRecipients += 1;
    }
  }
  if (handlerRecipients === 0) {
    return NextResponse.json(
      { error: 'Mindestens ein Bearbeiter muss adressiert sein.' },
      { status: 400 },
    );
  }

  const { deadlineAck, deadlineFeedback } = computeDeadlines();
  const encryptedPayload = JSON.stringify(payload);

  try {
    await prisma.$transaction(async (tx) => {
      const newCase = await tx.case.create({
        data: {
          officeId: office.id,
          encryptionVersion: 2,
          tokenHash,
          tokenLookup,
          wbPublicKey,
          category: category ?? null,
          encryptedPayload,
          deadlineAck,
          deadlineFeedback,
        },
        select: { id: true },
      });
      await tx.caseKey.createMany({
        data: Object.entries(wraps).map(([recipient, wrappedKey]) => ({
          caseId: newCase.id,
          recipient,
          wrappedKey,
        })),
      });
      await tx.auditLog.create({
        data: {
          actorType: 'WHISTLEBLOWER',
          action: 'CASE_CREATED',
          caseId: newCase.id,
          officeId: office.id,
          metadata: { category: category ?? null, v: 2 },
        },
      });
    });
  } catch {
    return NextResponse.json(
      { error: 'Die Meldung konnte nicht gespeichert werden.' },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      deadlineAck: deadlineAck.toISOString(),
      deadlineFeedback: deadlineFeedback.toISOString(),
    },
    { status: 201 },
  );
}
