// HinSchG — API: Ende-zu-Ende-Dateianhang des Hinweisgebers (Stufe 2)
//
// Erfordert eine gueltige, an den Fall gebundene Postfach-Session. Die Datei ist
// bereits clientseitig (Multi-Recipient) verschluesselt; der Server speichert nur
// Ciphertext (Datei + Dateiname) + Schluessel-Wraps und protokolliert
// ATTACHMENT_ADDED. Er sieht nie Klartext, nie den Original-Dateinamen.
//
// Wird sowohl vom Meldeformular (nach Auto-Login mit dem Token) als auch vom
// Postfach genutzt. MIME-Whitelist + Groessenlimit werden serverseitig erzwungen
// (zusaetzlich zur clientseitigen Pruefung).

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { RECIPIENT_RECOVERY, RECIPIENT_WHISTLEBLOWER, validateE2eAttachment } from '@/lib/cases';
import { prisma } from '@/lib/db';
import { clientKeyFromHeaders, rateLimit } from '@/lib/rate-limit';
import { INBOX_COOKIE, verifyInboxSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ATT_LIMIT = 30;
const ATT_WINDOW_MS = 30 * 60 * 1000;

export async function POST(request: Request): Promise<NextResponse> {
  const caseId = verifyInboxSession(cookies().get(INBOX_COOKIE)?.value);
  if (!caseId) {
    return NextResponse.json(
      { error: 'Nicht angemeldet oder Session abgelaufen.' },
      { status: 401 },
    );
  }

  const key = clientKeyFromHeaders(request.headers);
  const limit = rateLimit(`att:${key}`, ATT_LIMIT, ATT_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Zu viele Uploads. Bitte später erneut versuchen.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiges JSON.' }, { status: 400 });
  }
  const validation = validateE2eAttachment(raw);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const { mimeType, blob, filename, wraps, sizeBytes } = validation.value;

  const found = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      encryptionVersion: true,
      officeId: true,
      office: { select: { handlers: { select: { id: true } } } },
    },
  });
  if (!found || found.encryptionVersion !== 2) {
    return NextResponse.json({ error: 'Fall nicht gefunden.' }, { status: 404 });
  }

  // Wrap-Empfänger müssen RECOVERY, WB oder echte Bearbeiter-IDs des Office sein.
  const validIds = new Set<string>([
    RECIPIENT_RECOVERY,
    RECIPIENT_WHISTLEBLOWER,
    ...found.office.handlers.map((h) => h.id),
  ]);
  for (const id of Object.keys(wraps)) {
    if (!validIds.has(id)) {
      return NextResponse.json(
        { error: 'Unbekannter Empfänger im Schlüssel-Wrap.' },
        { status: 400 },
      );
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const attachment = await tx.caseAttachment.create({
      data: {
        caseId: found.id,
        encryptedBlobRef: JSON.stringify(blob),
        encryptedFilename: JSON.stringify(filename),
        mimeType,
        sizeBytes,
      },
      select: { id: true },
    });
    await tx.caseAttachmentKey.createMany({
      data: Object.entries(wraps).map(([recipient, wrappedKey]) => ({
        attachmentId: attachment.id,
        recipient,
        wrappedKey,
      })),
    });
    await tx.auditLog.create({
      data: {
        actorType: 'WHISTLEBLOWER',
        action: 'ATTACHMENT_ADDED',
        caseId: found.id,
        officeId: found.officeId,
        // Keine PII: nur MIME-Typ + Ciphertext-Groesse.
        metadata: { mimeType, sizeBytes },
      },
    });
    return attachment;
  });

  return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
}
