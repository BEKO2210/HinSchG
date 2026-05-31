// HinSchG — API: Eingang bestätigen (HinSchG-Eingangsbestätigung)
//
// Setzt acknowledgedAt, sendet dem Hinweisgeber eine (verschlüsselte) Nachricht
// und protokolliert ACK_SENT. Idempotent: bereits bestätigte Fälle bleiben
// unverändert.

import { NextResponse } from 'next/server';
import { adminApiGuard } from '@/lib/admin-auth';
import { encryptPayload } from '@/lib/crypto';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACK_MESSAGE =
  'Ihre Meldung ist bei der Meldestelle eingegangen und wird bearbeitet. Vielen Dank für Ihren Hinweis.';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await adminApiGuard(['ADMIN', 'HANDLER']);
  if ('error' in guard) {
    return guard.error;
  }

  const existing = await prisma.case.findFirst({
    where: { id: (await params).id, officeId: guard.session.o },
    select: { id: true, acknowledgedAt: true, encryptionVersion: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Fall nicht gefunden.' }, { status: 404 });
  }
  if (existing.acknowledgedAt) {
    return NextResponse.json({ ok: true, alreadyAcknowledged: true });
  }

  await prisma.$transaction(async (tx) => {
    await tx.case.update({ where: { id: existing.id }, data: { acknowledgedAt: new Date() } });
    // Stufe 1: automatische (serverseitig verschlüsselte) Eingangsbestätigung an
    // den Hinweisgeber. Bei Stufe 2 kann der Server keine Nachricht für den
    // Hinweisgeber verschlüsseln; der Eingang wird über den Status sichtbar.
    if (existing.encryptionVersion === 1) {
      await tx.caseMessage.create({
        data: {
          caseId: existing.id,
          direction: 'FROM_OFFICE',
          encryptedBody: encryptPayload(ACK_MESSAGE),
        },
      });
    }
    await tx.auditLog.create({
      data: {
        actorType: 'HANDLER',
        actorId: guard.session.h,
        action: 'ACK_SENT',
        caseId: existing.id,
        officeId: guard.session.o,
      },
    });
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
