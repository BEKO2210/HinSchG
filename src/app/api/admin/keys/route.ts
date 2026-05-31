// HinSchG — API: eigenes Stufe-2-Schluesselpaar des Bearbeiters hinterlegen
//
// Das X25519-Keypaar wird im Browser erzeugt; der private Key wird dort mit dem
// (erneut eingegebenen) Passwort verschluesselt und nur so gespeichert. Zur
// Autorisierung wird das Passwort serverseitig per Argon2id geprueft, damit eine
// uebernommene Session ohne Passwort keine Schluessel setzen/ueberschreiben kann.
// Einmalige Einrichtung (Rotation folgt spaeter).

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { base64 } from '@scure/base';
import { adminApiGuard } from '@/lib/admin-auth';
import { verifyPassword } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { ADMIN_COOKIE, verifyAdminSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const guard = adminApiGuard(['ADMIN', 'HANDLER']);
  if ('error' in guard) {
    return guard.error;
  }
  const session = verifyAdminSession(cookies().get(ADMIN_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungueltiges JSON.' }, { status: 400 });
  }
  const body = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const password = typeof body.password === 'string' ? body.password : '';
  const publicKey = typeof body.publicKey === 'string' ? body.publicKey : '';
  const encryptedPrivateKey =
    typeof body.encryptedPrivateKey === 'string' ? body.encryptedPrivateKey : '';

  let pubLen = 0;
  try {
    pubLen = base64.decode(publicKey).length;
  } catch {
    pubLen = 0;
  }
  if (pubLen !== 32 || !encryptedPrivateKey || encryptedPrivateKey.length > 10000) {
    return NextResponse.json({ error: 'Ungueltige Schlusseldaten.' }, { status: 400 });
  }

  const handler = await prisma.handler.findUnique({
    where: { id: session.h },
    select: { id: true, passwordHash: true, publicKey: true },
  });
  if (!handler || !verifyPassword(password, handler.passwordHash)) {
    return NextResponse.json({ error: 'Passwort falsch.' }, { status: 401 });
  }
  if (handler.publicKey) {
    return NextResponse.json(
      { error: 'Es ist bereits ein Schluesselpaar hinterlegt.' },
      { status: 409 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.handler.update({
      where: { id: handler.id },
      data: { publicKey, encryptedPrivateKey },
    });
    await tx.auditLog.create({
      data: {
        actorType: 'HANDLER',
        actorId: handler.id,
        action: 'HANDLER_KEY_ENROLLED',
        officeId: guard.session.o,
      },
    });
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
