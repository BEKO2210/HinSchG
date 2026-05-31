// HinSchG — API: SSO/OIDC-Login starten (Phase 10c)
//
// Erzeugt PKCE + state, legt sie in einem kurzlebigen signierten Cookie ab und
// leitet zum IdP weiter. Nur aktiv, wenn SSO konfiguriert ist.

import { NextResponse } from 'next/server';
import { buildAuthorizationUrl, generatePkce, generateState, getOidcConfig } from '@/lib/oidc';
import { OIDC_FLOW_COOKIE, createOidcFlowState, sessionCookieOptions } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const config = getOidcConfig();
  if (!config) {
    return NextResponse.json({ error: 'SSO ist nicht konfiguriert.' }, { status: 503 });
  }

  const state = generateState();
  const { verifier, challenge } = generatePkce();
  const url = buildAuthorizationUrl(config, { state, codeChallenge: challenge });

  const flow = createOidcFlowState({ st: state, v: verifier });
  const response = NextResponse.redirect(url, { status: 302 });
  response.cookies.set(OIDC_FLOW_COOKIE, flow.value, sessionCookieOptions(flow.maxAgeSeconds));
  return response;
}
