// HinSchG — API: Postfach schliessen (Session-Cookie loeschen)

import { NextResponse } from 'next/server';
import { INBOX_COOKIE, inboxCookieOptions } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set(INBOX_COOKIE, '', inboxCookieOptions(0));
  return response;
}
