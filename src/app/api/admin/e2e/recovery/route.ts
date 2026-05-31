// HinSchG — API: Org-Recovery-Schluessel der Meldestelle einrichten (nur ADMIN)
//
// Stufe-2-E2E: Der Recovery-Public-Key wird bei jeder E2E-Meldung als zusaetzlicher
// Empfaenger genutzt, damit Faelle wiederherstellbar bleiben, wenn ein Bearbeiter
// sein Passwort verliert. Der private Recovery-Key wird ausschliesslich im Browser
// mit einer separat verwahrten Passphrase verschluesselt und nur so gespeichert —
// der Server sieht ihn nie im Klartext.

import { NextResponse } from 'next/server';
import { base64 } from '@scure/base';
import { adminApiGuard } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const guard = await adminApiGuard(['ADMIN']);
  if ('error' in guard) {
    return guard.error;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungueltiges JSON.' }, { status: 400 });
  }
  const body = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const recoveryPublicKey =
    typeof body.recoveryPublicKey === 'string' ? body.recoveryPublicKey : '';
  const encryptedRecoveryPrivateKey =
    typeof body.encryptedRecoveryPrivateKey === 'string' ? body.encryptedRecoveryPrivateKey : '';

  // Public Key muss ein gueltiger 32-Byte-X25519-Key (Base64) sein.
  let pubLen = 0;
  try {
    pubLen = base64.decode(recoveryPublicKey).length;
  } catch {
    pubLen = 0;
  }
  if (pubLen !== 32) {
    return NextResponse.json({ error: 'Ungueltiger Recovery-Public-Key.' }, { status: 400 });
  }
  if (!encryptedRecoveryPrivateKey || encryptedRecoveryPrivateKey.length > 10000) {
    return NextResponse.json(
      { error: 'Ungueltiger verschluesselter Recovery-Private-Key.' },
      { status: 400 },
    );
  }

  // Mandantentrennung: ausschliesslich die eigene Meldestelle.
  const office = await prisma.reportingOffice.findUnique({
    where: { id: guard.session.o },
    select: { id: true, recoveryPublicKey: true },
  });
  if (!office) {
    return NextResponse.json({ error: 'Keine Meldestelle konfiguriert.' }, { status: 503 });
  }
  if (office.recoveryPublicKey) {
    return NextResponse.json(
      { error: 'Es ist bereits ein Recovery-Schluessel eingerichtet.' },
      { status: 409 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.reportingOffice.update({
      where: { id: office.id },
      data: { recoveryPublicKey, encryptedRecoveryPrivateKey },
    });
    await tx.auditLog.create({
      data: {
        actorType: 'HANDLER',
        actorId: guard.session.h,
        action: 'E2E_RECOVERY_SET',
        officeId: guard.session.o,
      },
    });
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
