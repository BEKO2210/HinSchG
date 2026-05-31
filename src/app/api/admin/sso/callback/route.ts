// HinSchG — API: SSO/OIDC-Callback (Phase 10c)
//
// Verifiziert state (CSRF) gegen das Flow-Cookie, tauscht den Code per PKCE,
// holt die verifizierte E-Mail vom userinfo-Endpoint und meldet die BEREITS
// EXISTIERENDE Bearbeiter:in an. KEIN Auto-Provisioning: unbekannte oder nicht
// verifizierte E-Mails werden abgelehnt. Bei Erfolg entsteht dieselbe
// Admin-Session wie beim Passwort+TOTP-Login (officeId-gebunden).

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exchangeCode, fetchUserinfo, getOidcConfig } from '@/lib/oidc';
import {
  ADMIN_COOKIE,
  OIDC_FLOW_COOKIE,
  createAdminSession,
  sessionCookieOptions,
  verifyOidcFlowState,
} from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function loginRedirect(request: Request, error: string): NextResponse {
  const url = new URL('/admin/login', new URL(request.url).origin);
  url.searchParams.set('sso_error', error);
  const response = NextResponse.redirect(url, { status: 302 });
  // Flow-Cookie in jedem Fall entwerten.
  response.cookies.set(OIDC_FLOW_COOKIE, '', sessionCookieOptions(0));
  return response;
}

export async function GET(request: Request): Promise<NextResponse> {
  const config = getOidcConfig();
  if (!config) {
    return NextResponse.json({ error: 'SSO ist nicht konfiguriert.' }, { status: 503 });
  }

  const params = new URL(request.url).searchParams;
  const code = params.get('code') ?? '';
  const state = params.get('state') ?? '';

  const flow = verifyOidcFlowState((await cookies()).get(OIDC_FLOW_COOKIE)?.value);
  // state-Vergleich (CSRF): Cookie muss existieren und exakt passen.
  if (!flow || !state || state !== flow.st || !code) {
    return loginRedirect(request, 'ungueltig');
  }

  let email: string;
  let emailVerified: boolean;
  try {
    const accessToken = await exchangeCode(config, { code, codeVerifier: flow.v });
    const identity = await fetchUserinfo(config, accessToken);
    email = identity.email;
    emailVerified = identity.emailVerified;
  } catch {
    return loginRedirect(request, 'fehlgeschlagen');
  }

  if (!emailVerified) {
    return loginRedirect(request, 'email_unbestaetigt');
  }

  // KEIN Auto-Provisioning: nur bereits existierende Bearbeiter:innen.
  const handler = await prisma.handler.findUnique({
    where: { email },
    select: { id: true, role: true, officeId: true },
  });
  if (!handler) {
    return loginRedirect(request, 'kein_konto');
  }

  await prisma.auditLog.create({
    data: {
      actorType: 'HANDLER',
      actorId: handler.id,
      action: 'LOGIN_SUCCESS',
      officeId: handler.officeId,
      metadata: { via: 'sso' },
    },
  });

  const session = createAdminSession(handler.id, handler.role, handler.officeId);
  const target = handler.role === 'SUPERADMIN' ? '/admin/offices' : '/admin';
  const response = NextResponse.redirect(new URL(target, new URL(request.url).origin), {
    status: 302,
  });
  response.cookies.set(ADMIN_COOKIE, session.value, sessionCookieOptions(session.maxAgeSeconds));
  response.cookies.set(OIDC_FLOW_COOKIE, '', sessionCookieOptions(0));
  return response;
}
