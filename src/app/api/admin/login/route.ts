// HinSchG — API: Bearbeiter-Login Schritt 1 (E-Mail + Passwort)
//
// Bei korrektem Passwort wird KEINE Session erteilt, sondern ein kurzlebiger
// Pre-Auth-Cookie gesetzt; erst nach erfolgreicher TOTP-2FA entsteht die
// eigentliche Session (siehe /api/admin/login/totp).

import { NextResponse } from 'next/server';
import { encryptPayload, verifyPassword } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import {
  authThrottleStatus,
  clientKeyFromHeaders,
  rateLimit,
  recordAuthFailure,
  recordAuthSuccess,
} from '@/lib/rate-limit';
import { ADMIN_PREAUTH_COOKIE, createAdminPreAuth, sessionCookieOptions } from '@/lib/session';
import { generateTotpSecret, totpKeyUri, totpQrDataUrl } from '@/lib/totp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOGIN_LIMIT = 20;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request): Promise<NextResponse> {
  const ip = clientKeyFromHeaders(request.headers);
  const key = `adminlogin:${ip}`;

  const backoff = authThrottleStatus(key);
  if (backoff.blocked) {
    return NextResponse.json(
      { error: 'Zu viele Versuche. Bitte spaeter erneut.' },
      { status: 429, headers: { 'Retry-After': String(Math.max(backoff.retryAfterSec, 1)) } },
    );
  }
  const limit = rateLimit(key, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Zu viele Versuche. Bitte spaeter erneut.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungueltiges JSON.' }, { status: 400 });
  }
  const body = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) {
    return NextResponse.json({ error: 'E-Mail und Passwort erforderlich.' }, { status: 400 });
  }

  const handler = await prisma.handler.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, totpSecret: true },
  });

  if (!handler || !verifyPassword(password, handler.passwordHash)) {
    recordAuthFailure(key);
    await prisma.auditLog.create({
      data: { actorType: 'HANDLER', actorId: handler?.id ?? null, action: 'LOGIN_FAILED' },
    });
    return NextResponse.json({ error: 'Anmeldung fehlgeschlagen.' }, { status: 401 });
  }

  // Passwort korrekt -> Backoff fuer diese IP zuruecksetzen; 2FA folgt.
  recordAuthSuccess(key);

  if (!handler.totpSecret) {
    // Erstmaliges TOTP-Setup: Secret erzeugen, aber NOCH NICHT persistieren —
    // es reist verschluesselt im signierten Pre-Auth-Cookie mit und wird erst
    // nach erfolgreicher Verifikation gespeichert.
    const secret = generateTotpSecret();
    const otpauthUri = totpKeyUri(email, secret);
    const qrDataUrl = await totpQrDataUrl(otpauthUri);
    const pre = createAdminPreAuth({ h: handler.id, setup: true, s: encryptPayload(secret) });
    const response = NextResponse.json({ stage: 'totp_setup', secret, otpauthUri, qrDataUrl });
    response.cookies.set(ADMIN_PREAUTH_COOKIE, pre.value, sessionCookieOptions(pre.maxAgeSeconds));
    return response;
  }

  const pre = createAdminPreAuth({ h: handler.id, setup: false });
  const response = NextResponse.json({ stage: 'totp' });
  response.cookies.set(ADMIN_PREAUTH_COOKIE, pre.value, sessionCookieOptions(pre.maxAgeSeconds));
  return response;
}
