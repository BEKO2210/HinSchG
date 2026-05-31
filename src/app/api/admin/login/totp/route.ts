// HinSchG — API: Bearbeiter-Login Schritt 2 (TOTP-2FA, Pflicht)
//
// Erfordert den Pre-Auth-Cookie aus Schritt 1. Bei Erfolg wird die eigentliche
// Admin-Session erteilt; beim erstmaligen Setup wird das (verifizierte) Secret
// verschluesselt persistiert.

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { decryptPayload, encryptPayload } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import {
  authThrottleStatus,
  clientKeyFromHeaders,
  rateLimit,
  recordAuthFailure,
  recordAuthSuccess,
} from '@/lib/rate-limit';
import {
  ADMIN_COOKIE,
  ADMIN_PREAUTH_COOKIE,
  createAdminSession,
  sessionCookieOptions,
  verifyAdminPreAuth,
} from '@/lib/session';
import { verifyTotp } from '@/lib/totp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOTP_LIMIT = 10;
const TOTP_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request): Promise<NextResponse> {
  const pre = verifyAdminPreAuth(cookies().get(ADMIN_PREAUTH_COOKIE)?.value);
  if (!pre) {
    return NextResponse.json(
      { error: 'Sitzung abgelaufen. Bitte erneut anmelden.' },
      { status: 401 },
    );
  }

  const ip = clientKeyFromHeaders(request.headers);
  const key = `admintotp:${ip}`;
  const backoff = authThrottleStatus(key);
  if (backoff.blocked) {
    return NextResponse.json(
      { error: 'Zu viele Versuche. Bitte spaeter erneut.' },
      { status: 429, headers: { 'Retry-After': String(Math.max(backoff.retryAfterSec, 1)) } },
    );
  }
  const limit = rateLimit(key, TOTP_LIMIT, TOTP_WINDOW_MS);
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
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'Bitte einen 6-stelligen Code eingeben.' }, { status: 400 });
  }

  const handler = await prisma.handler.findUnique({
    where: { id: pre.h },
    select: { id: true, role: true, totpSecret: true },
  });
  if (!handler) {
    return NextResponse.json({ error: 'Konto nicht gefunden.' }, { status: 401 });
  }

  // Secret bestimmen: beim Setup aus dem Pre-Auth-Cookie, sonst aus der DB.
  let secret: string | null = null;
  try {
    if (pre.setup && pre.s) {
      secret = decryptPayload(pre.s);
    } else if (handler.totpSecret) {
      secret = decryptPayload(handler.totpSecret);
    }
  } catch {
    secret = null;
  }

  if (!secret || !verifyTotp(code, secret)) {
    recordAuthFailure(key);
    await prisma.auditLog.create({
      data: { actorType: 'HANDLER', actorId: handler.id, action: '2FA_FAILED' },
    });
    return NextResponse.json({ error: 'Ungueltiger 2FA-Code.' }, { status: 401 });
  }

  // Erfolg: beim Setup das verifizierte Secret persistieren.
  if (pre.setup) {
    await prisma.handler.update({
      where: { id: handler.id },
      data: { totpSecret: encryptPayload(secret) },
    });
  }

  recordAuthSuccess(key);
  await prisma.auditLog.create({
    data: { actorType: 'HANDLER', actorId: handler.id, action: 'LOGIN_SUCCESS' },
  });

  const session = createAdminSession(handler.id, handler.role);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, session.value, sessionCookieOptions(session.maxAgeSeconds));
  // Pre-Auth-Cookie entwerten.
  response.cookies.set(ADMIN_PREAUTH_COOKIE, '', sessionCookieOptions(0));
  return response;
}
