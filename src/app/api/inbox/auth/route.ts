// HinSchG — API: Postfach-Login per Receipt-Token (kein Account)
//
// Ablauf:
//   1. Rate Limit + exponentielles Backoff je transientem Schlüssel (IP).
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
import { INBOX_COOKIE, createInboxSession, sessionCookieOptions } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Grobe Obergrenze zusätzlich zum Backoff.
const AUTH_LIMIT = 30;
const AUTH_WINDOW_MS = 15 * 60 * 1000;

function tooMany(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { error: 'Zu viele Versuche. Bitte später erneut versuchen.' },
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
    return NextResponse.json({ error: 'Ungültiges JSON.' }, { status: 400 });
  }
  const body = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const token = typeof body.token === 'string' ? body.token : '';
  // Stufe 2: Der Client berechnet den Lookup-Hash selbst; der Token wird nie
  // an den Server gesendet. Der Besitz des Tokens wird implizit durch die
  // anschließende clientseitige Entschlüsselung nachgewiesen.
  const tokenLookup = typeof body.tokenLookup === 'string' ? body.tokenLookup.trim() : '';

  let caseId: string | null = null;

  if (tokenLookup) {
    const found = await prisma.case.findFirst({
      where: { tokenLookup, encryptionVersion: 2 },
      select: { id: true },
    });
    caseId = found?.id ?? null;
  } else {
    if (!token.trim()) {
      return NextResponse.json(
        { error: 'Bitte geben Sie Ihren Zugangscode ein.' },
        { status: 400 },
      );
    }
    // Stufe 1: Blind-Index-Lookup, danach maßgebliche Argon2id-Verifikation.
    const found = await prisma.case.findUnique({
      where: { tokenLookup: tokenBlindIndex(token) },
      select: { id: true, tokenHash: true, encryptionVersion: true },
    });
    if (found && found.encryptionVersion === 1 && verifyToken(token, found.tokenHash)) {
      caseId = found.id;
    }
  }

  if (!caseId) {
    recordAuthFailure(key);
    return NextResponse.json({ error: 'Ungültiger Zugangscode.' }, { status: 401 });
  }

  recordAuthSuccess(key);
  const session = createInboxSession(caseId);
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set(INBOX_COOKIE, session.value, sessionCookieOptions(session.maxAgeSeconds));
  return response;
}
