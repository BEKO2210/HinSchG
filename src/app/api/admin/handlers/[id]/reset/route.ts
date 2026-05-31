// HinSchG — API: Bearbeiter:in zurücksetzen (nur ADMIN)
//
// Setzt ein neues Initialpasswort und verwirft das E2E-Schlüsselpaar (der private
// Schlüssel war an das alte Passwort gebunden und ist nach einem Passwortverlust
// nicht mehr nutzbar). Die Person richtet beim nächsten Login ein neues
// Schlüsselpaar ein; den Zugriff auf bestehende E2E-Fälle stellt ein:e ADMIN
// anschließend per Recovery-Schlüssel wieder her.

import { NextResponse } from 'next/server';
import { adminApiGuard } from '@/lib/admin-auth';
import { hashPassword } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { HANDLER_PASSWORD_MIN } from '@/lib/handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const guard = adminApiGuard(['ADMIN']);
  if ('error' in guard) {
    return guard.error;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiges JSON.' }, { status: 400 });
  }
  const password =
    typeof (raw as Record<string, unknown>)?.password === 'string'
      ? ((raw as Record<string, unknown>).password as string)
      : '';
  if (password.length < HANDLER_PASSWORD_MIN) {
    return NextResponse.json(
      { error: `Das Passwort muss mindestens ${HANDLER_PASSWORD_MIN} Zeichen lang sein.` },
      { status: 400 },
    );
  }

  // Mandantentrennung: nur Bearbeiter:innen der eigenen Meldestelle.
  const target = await prisma.handler.findFirst({
    where: { id: params.id, officeId: guard.session.o },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json({ error: 'Bearbeiter:in nicht gefunden.' }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.handler.update({
      where: { id: target.id },
      data: { passwordHash: hashPassword(password), publicKey: null, encryptedPrivateKey: null },
    });
    await tx.auditLog.create({
      data: {
        actorType: 'HANDLER',
        actorId: guard.session.h,
        action: 'HANDLER_RESET',
        officeId: guard.session.o,
        metadata: { handlerId: target.id },
      },
    });
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
