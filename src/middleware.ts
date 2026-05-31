// HinSchG — Edge-Middleware: strikte Content-Security-Policy (nonce-basiert) +
// globales Rate Limiting / Abuse-Schutz.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { clientKeyFromHeaders, rateLimit } from '@/lib/rate-limit';

// Globales Limit pro IP über alle Routen hinweg (grober Missbrauchsschutz;
// die einzelnen Endpunkte haben zusätzlich strengere Limits).
const GLOBAL_LIMIT = 600;
const GLOBAL_WINDOW_MS = 60 * 1000;

export function middleware(request: NextRequest): NextResponse {
  // --- Globales Rate Limiting ----------------------------------------------
  const ip = clientKeyFromHeaders(request.headers);
  const limit = rateLimit(`global:${ip}`, GLOBAL_LIMIT, GLOBAL_WINDOW_MS);
  if (!limit.ok) {
    return new NextResponse('Too Many Requests', {
      status: 429,
      headers: { 'Retry-After': String(limit.retryAfterSec) },
    });
  }

  // --- Content-Security-Policy (nonce pro Request) -------------------------
  const nonce = btoa(crypto.randomUUID());
  const isDev = process.env.NODE_ENV !== 'production';
  // Tor Onion Services laufen ueber HTTP (.onion) — dort darf nicht auf HTTPS
  // hochgestuft werden, sonst ist die Seite nicht erreichbar.
  const isOnion = (request.headers.get('host') ?? '').endsWith('.onion');
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "object-src 'none'",
    // 'strict-dynamic' erlaubt nonce-signierten Skripten das Nachladen weiterer
    // Chunks; in der Entwicklung braucht Next zusätzlich 'unsafe-eval'.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    ...(isOnion ? [] : ['upgrade-insecure-requests']),
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);
  return response;
}

export const config = {
  // Auf alle Routen anwenden, ausser statische Assets/Bilder/Favicon.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
