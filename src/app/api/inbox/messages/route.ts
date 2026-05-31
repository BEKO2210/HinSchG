// HinSchG — API: Antwort des Hinweisgebers im Postfach
//
// Erfordert eine gültige, an den Fall gebundene Session. Die Nachricht wird
// verschlüsselt gespeichert (CaseMessage, direction=FROM_WHISTLEBLOWER) und im
// Audit-Log ohne Inhalt vermerkt.

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { encryptPayload } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { clientKeyFromHeaders, rateLimit } from '@/lib/rate-limit';
import { INBOX_COOKIE, verifyInboxSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MESSAGE_MAX = 20000;
const MSG_LIMIT = 20;
const MSG_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request): Promise<NextResponse> {
  const caseId = verifyInboxSession(cookies().get(INBOX_COOKIE)?.value);
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
  const bodyText =
    typeof raw === 'object' &&
    raw !== null &&
    typeof (raw as Record<string, unknown>).body === 'string'
      ? ((raw as Record<string, unknown>).body as string).trim()
      : '';
  if (!bodyText) {
    return NextResponse.json({ error: 'Die Nachricht darf nicht leer sein.' }, { status: 400 });
  }
  if (bodyText.length > MESSAGE_MAX) {
    return NextResponse.json(
      { error: `Die Nachricht darf höchstens ${MESSAGE_MAX} Zeichen lang sein.` },
      { status: 400 },
    );
  }

  // Sicherstellen, dass der Fall existiert (Session könnte auf gelöschten Fall zeigen).
  const existing = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: 'Fall nicht gefunden.' }, { status: 404 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.caseMessage.create({
        data: {
          caseId,
          direction: 'FROM_WHISTLEBLOWER',
          encryptedBody: encryptPayload(bodyText),
        },
      });
      await tx.auditLog.create({
        data: {
          actorType: 'WHISTLEBLOWER',
          action: 'WB_MESSAGE_ADDED',
          caseId,
          // Kein Inhalt im Audit-Log.
        },
      });
    });
  } catch {
    return NextResponse.json(
      { error: 'Die Nachricht konnte nicht gespeichert werden.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
