// HinSchG — API: Postfach-Login per Receipt-Token (kein Account)
//
// Ablauf:
//   1. Rate Limit + exponentielles Backoff je transientem Schluessel (IP).
//   2. Blind-Index berechnen -> passenden Fall in O(1) finden.
//   3. Argon2id-Verifikation des Tokens gegen tokenHash (maszgeblich).
//   4. Bei Erfolg: kurzlebiges, signiertes httpOnly-Cookie setzen.

import { NextResponse } from 'next/server';
import { tokenBlindIndex, verifyToken } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import {
  authThrottleStatus,
  clientKeyFromHeaders,
  rateLimit,
  recordAuthFailure,
  recordAuthSuccess,
} from '@/lib/rate-limit';
import { INBOX_COOKIE, createInboxSession, inboxCookieOptions } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Grobe Obergrenze zusaetzlich zum Backoff.
const AUTH_LIMIT = 30;
const AUTH_WINDOW_MS = 15 * 60 * 1000;

function tooMany(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { error: 'Zu viele Versuche. Bitte spaeter erneut versuchen.' },
    { status: 429, headers: { 'Retry-After': String(Math.max(retryAfterSec, 1)) } },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const key = clientKeyFromHeaders(request.headers);

  const backoff = authThrottleStatus(key);
  if (backoff.blocked) {
    return tooMany(backoff.retryAfterSec);
  }
  const limit = rateLimit(`auth:${key}`, AUTH_LIMIT, AUTH_WINDOW_MS);
  if (!limit.ok) {
    return tooMany(limit.retryAfterSec);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungueltiges JSON.' }, { status: 400 });
  }
  const token =
    typeof raw === 'object' &&
    raw !== null &&
    typeof (raw as Record<string, unknown>).token === 'string'
      ? ((raw as Record<string, unknown>).token as string)
      : '';
  if (!token.trim()) {
    return NextResponse.json({ error: 'Bitte geben Sie Ihren Zugangscode ein.' }, { status: 400 });
  }

  // Blind-Index-Lookup, danach maszgebliche Argon2id-Verifikation.
  const found = await prisma.case.findUnique({
    where: { tokenLookup: tokenBlindIndex(token) },
    select: { id: true, tokenHash: true },
  });

  if (!found || !verifyToken(token, found.tokenHash)) {
    recordAuthFailure(key);
    return NextResponse.json({ error: 'Ungueltiger Zugangscode.' }, { status: 401 });
  }

  recordAuthSuccess(key);
  const session = createInboxSession(found.id);
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set(INBOX_COOKIE, session.value, inboxCookieOptions(session.maxAgeSeconds));
  return response;
}
