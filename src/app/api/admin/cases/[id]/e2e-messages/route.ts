// HinSchG — API: Ende-zu-Ende-Antwort der Meldestelle (Stufe 2)
//
// Die Nachricht ist bereits clientseitig (Multi-Recipient) verschluesselt. Der
// Server speichert nur Ciphertext + Schluessel-Wraps; er sieht keinen Klartext.

import { NextResponse } from 'next/server';
import { adminApiGuard } from '@/lib/admin-auth';
import { RECIPIENT_RECOVERY, RECIPIENT_WHISTLEBLOWER, validateE2eMessage } from '@/lib/cases';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await adminApiGuard(['ADMIN', 'HANDLER']);
  if ('error' in guard) {
    return guard.error;
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

  const found = await prisma.case.findFirst({
    where: { id: (await params).id, officeId: guard.session.o },
    select: {
      id: true,
      encryptionVersion: true,
      office: { select: { recoveryPublicKey: true, handlers: { select: { id: true } } } },
    },
  });
  if (!found) {
    return NextResponse.json({ error: 'Fall nicht gefunden.' }, { status: 404 });
  }
  if (found.encryptionVersion !== 2) {
    return NextResponse.json(
      { error: 'Fall ist nicht Ende-zu-Ende-verschlüsselt.' },
      { status: 400 },
    );
  }

  // Wrap-Empfänger müssen RECOVERY, WB oder echte Bearbeiter-IDs sein.
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
        direction: 'FROM_OFFICE',
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
        actorType: 'HANDLER',
        actorId: guard.session.h,
        action: 'OFFICE_MESSAGE_ADDED',
        caseId: found.id,
        officeId: guard.session.o,
      },
    });
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
