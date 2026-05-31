// HinSchG — API: Ende-zu-Ende-Antwort des Hinweisgebers (Stufe 2)
//
// Erfordert eine gueltige, an den Fall gebundene Postfach-Session. Die Nachricht
// ist bereits clientseitig (Multi-Recipient) verschluesselt; der Server speichert
// nur Ciphertext + Schluessel-Wraps und protokolliert WB_MESSAGE_ADDED.

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { RECIPIENT_RECOVERY, RECIPIENT_WHISTLEBLOWER, validateE2eMessage } from '@/lib/cases';
import { prisma } from '@/lib/db';
import { clientKeyFromHeaders, rateLimit } from '@/lib/rate-limit';
import { INBOX_COOKIE, verifyInboxSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MSG_LIMIT = 20;
const MSG_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request): Promise<NextResponse> {
  const caseId = verifyInboxSession((await cookies()).get(INBOX_COOKIE)?.value);
  if (!caseId) {
    return NextResponse.json(
      { error: 'Nicht angemeldet oder Session abgelaufen.' },
      { status: 401 },
    );
  }

  const key = clientKeyFromHeaders(request.headers);
  const limit = rateLimit(`msg:${key}`, MSG_LIMIT, MSG_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Zu viele Nachrichten. Bitte später erneut versuchen.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiges JSON.' }, { status: 400 });
  }
  const validation = validateE2eMessage(raw);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const { payload, wraps } = validation.value;

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

  await prisma.$transaction(async (tx) => {
    const message = await tx.caseMessage.create({
      data: {
        caseId: found.id,
        direction: 'FROM_WHISTLEBLOWER',
        encryptedBody: JSON.stringify(payload),
      },
      select: { id: true },
    });
    await tx.caseMessageKey.createMany({
      data: Object.entries(wraps).map(([recipient, wrappedKey]) => ({
        messageId: message.id,
        recipient,
        wrappedKey,
      })),
    });
    await tx.auditLog.create({
      data: {
        actorType: 'WHISTLEBLOWER',
        action: 'WB_MESSAGE_ADDED',
        caseId: found.id,
        officeId: found.officeId,
      },
    });
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
