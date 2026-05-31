// HinSchG — API: Bearbeiter anlegen (nur ADMIN)
//
// Rolle wird serverseitig erzwungen. Der neue Bearbeiter richtet seine TOTP-2FA
// beim ersten Login selbst ein.

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { hashPassword } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { validateHandlerInput } from '@/lib/handlers';
import { ADMIN_COOKIE, verifyAdminSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const session = verifyAdminSession(cookies().get(ADMIN_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
  }
  if (session.r !== 'ADMIN') {
    return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungueltiges JSON.' }, { status: 400 });
  }

  const validation = validateHandlerInput(raw);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const { email, password, role } = validation.value;

  // Office des anlegenden Admins ermitteln.
  const admin = await prisma.handler.findUnique({
    where: { id: session.h },
    select: { officeId: true },
  });
  if (!admin) {
    return NextResponse.json({ error: 'Konto nicht gefunden.' }, { status: 401 });
  }

  const existing = await prisma.handler.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return NextResponse.json(
      { error: 'Es existiert bereits ein Bearbeiter mit dieser E-Mail.' },
      { status: 409 },
    );
  }

  let created: { id: string };
  try {
    created = await prisma.$transaction(async (tx) => {
      const handler = await tx.handler.create({
        data: { email, passwordHash: hashPassword(password), role, officeId: admin.officeId },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorType: 'HANDLER',
          actorId: session.h,
          action: 'HANDLER_CREATED',
          metadata: { role, handlerId: handler.id },
        },
      });
      return handler;
    });
  } catch {
    return NextResponse.json(
      { error: 'Der Bearbeiter konnte nicht angelegt werden.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
}
