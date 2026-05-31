// HinSchG — API: Stufe-2-Wiederherstellung per Org-Recovery-Schluessel (nur ADMIN)
//
// GET liefert die fuer das Re-Wrapping noetigen (oeffentlichen bzw.
// passphrasenverschluesselten) Daten. POST nimmt die im Browser neu verpackten
// Schluessel-Wraps entgegen und gewaehrt damit Bearbeiter:innen Zugriff auf den
// Fall. Der Server sieht zu keinem Zeitpunkt Klartext oder den Inhaltsschluessel.

import { NextResponse } from 'next/server';
import { adminApiGuard } from '@/lib/admin-auth';
import { RECIPIENT_RECOVERY } from '@/lib/cases';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const isWrap = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 2048 && B64_RE.test(v);

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const guard = adminApiGuard(['ADMIN']);
  if ('error' in guard) {
    return guard.error;
  }

  const found = await prisma.case.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      encryptionVersion: true,
      keys: { select: { recipient: true, wrappedKey: true } },
      messages: { select: { id: true, keys: { select: { recipient: true, wrappedKey: true } } } },
      office: {
        select: {
          recoveryPublicKey: true,
          encryptedRecoveryPrivateKey: true,
          handlers: {
            where: { publicKey: { not: null } },
            select: { id: true, publicKey: true },
          },
        },
      },
    },
  });
  if (!found || found.encryptionVersion !== 2) {
    return NextResponse.json({ error: 'Fall nicht gefunden.' }, { status: 404 });
  }
  if (!found.office.recoveryPublicKey || !found.office.encryptedRecoveryPrivateKey) {
    return NextResponse.json({ error: 'Kein Recovery-Schlüssel eingerichtet.' }, { status: 409 });
  }

  return NextResponse.json({
    recoveryPublicKey: found.office.recoveryPublicKey,
    encryptedRecoveryPrivateKey: found.office.encryptedRecoveryPrivateKey,
    caseRecoveryWrap:
      found.keys.find((k) => k.recipient === RECIPIENT_RECOVERY)?.wrappedKey ?? null,
    messages: found.messages.map((m) => ({
      id: m.id,
      recoveryWrap: m.keys.find((k) => k.recipient === RECIPIENT_RECOVERY)?.wrappedKey ?? null,
    })),
    handlers: found.office.handlers.map((h) => ({ id: h.id, publicKey: h.publicKey })),
  });
}

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
  const body = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const caseWraps = (body.caseWraps ?? {}) as Record<string, unknown>;
  const messageWraps = (body.messageWraps ?? {}) as Record<string, Record<string, unknown>>;

  const found = await prisma.case.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      encryptionVersion: true,
      messages: { select: { id: true } },
      office: {
        select: { handlers: { where: { publicKey: { not: null } }, select: { id: true } } },
      },
    },
  });
  if (!found || found.encryptionVersion !== 2) {
    return NextResponse.json({ error: 'Fall nicht gefunden.' }, { status: 404 });
  }
  const handlerIds = new Set(found.office.handlers.map((h) => h.id));
  const messageIds = new Set(found.messages.map((m) => m.id));

  // Validierung: nur echte Bearbeiter-IDs / Nachrichten-IDs, gültige Wraps.
  for (const [hid, wrap] of Object.entries(caseWraps)) {
    if (!handlerIds.has(hid) || !isWrap(wrap)) {
      return NextResponse.json({ error: 'Ungültiger Fall-Wrap.' }, { status: 400 });
    }
  }
  for (const [mid, perHandler] of Object.entries(messageWraps)) {
    if (!messageIds.has(mid) || typeof perHandler !== 'object' || perHandler === null) {
      return NextResponse.json({ error: 'Ungültiger Nachrichten-Wrap.' }, { status: 400 });
    }
    for (const [hid, wrap] of Object.entries(perHandler)) {
      if (!handlerIds.has(hid) || !isWrap(wrap)) {
        return NextResponse.json({ error: 'Ungültiger Nachrichten-Wrap.' }, { status: 400 });
      }
    }
  }

  let regranted = 0;
  await prisma.$transaction(async (tx) => {
    for (const [recipient, wrappedKey] of Object.entries(caseWraps)) {
      await tx.caseKey.upsert({
        where: { caseId_recipient: { caseId: found.id, recipient } },
        update: { wrappedKey: wrappedKey as string },
        create: { caseId: found.id, recipient, wrappedKey: wrappedKey as string },
      });
      regranted += 1;
    }
    for (const [messageId, perHandler] of Object.entries(messageWraps)) {
      for (const [recipient, wrappedKey] of Object.entries(perHandler)) {
        await tx.caseMessageKey.upsert({
          where: { messageId_recipient: { messageId, recipient } },
          update: { wrappedKey: wrappedKey as string },
          create: { messageId, recipient, wrappedKey: wrappedKey as string },
        });
      }
    }
    await tx.auditLog.create({
      data: {
        actorType: 'HANDLER',
        actorId: guard.session.h,
        action: 'CASE_RECOVERED',
        caseId: found.id,
        metadata: { regrantedHandlers: regranted },
      },
    });
  });

  return NextResponse.json({ ok: true, regranted }, { status: 200 });
}
