// HinSchG — API: Antwort der Meldestelle an den Hinweisgeber
//
// Speichert eine verschlüsselte CaseMessage (FROM_OFFICE), die im anonymen
// Postfach des Hinweisgebers erscheint, und protokolliert OFFICE_MESSAGE_ADDED.

import { NextResponse } from 'next/server';
import { adminApiGuard } from '@/lib/admin-auth';
import { encryptPayload } from '@/lib/crypto';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MESSAGE_MAX = 20000;

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const guard = adminApiGuard(['ADMIN', 'HANDLER']);
  if ('error' in guard) {
    return guard.error;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiges JSON.' }, { status: 400 });
  }
  const bodyText =
    typeof (raw as Record<string, unknown>)?.body === 'string'
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

  const existing = await prisma.case.findFirst({
    where: { id: params.id, officeId: guard.session.o },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Fall nicht gefunden.' }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.caseMessage.create({
      data: {
        caseId: existing.id,
        direction: 'FROM_OFFICE',
        encryptedBody: encryptPayload(bodyText),
      },
    });
    await tx.auditLog.create({
      data: {
        actorType: 'HANDLER',
        actorId: guard.session.h,
        action: 'OFFICE_MESSAGE_ADDED',
        caseId: existing.id,
        officeId: guard.session.o,
      },
    });
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
