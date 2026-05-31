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
import { computeDeadlines, validateReportInput } from '@/lib/cases';
import { prisma } from '@/lib/db';
import { clientKeyFromHeaders, rateLimit } from '@/lib/rate-limit';

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

  const validation = validateReportInput(raw);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const { category, description, incidentDate, contact } = validation.value;

  // --- Ziel-Meldestelle ermitteln (MVP: erste/einzige) ----------------------
  const office = await prisma.reportingOffice.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
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
