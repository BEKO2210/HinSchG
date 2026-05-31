// HinSchG — API: Bearbeiter-Logout (Session + Pre-Auth-Cookie loeschen)

import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, ADMIN_PREAUTH_COOKIE, sessionCookieOptions } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, '', sessionCookieOptions(0));
  response.cookies.set(ADMIN_PREAUTH_COOKIE, '', sessionCookieOptions(0));
  return response;
}
