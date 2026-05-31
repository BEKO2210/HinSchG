// HinSchG — SSO / OpenID Connect fuer Bearbeiter:innen (Phase 10c)
//
// Ausschliesslich betreiberseitig: meldet eine BEREITS EXISTIERENDE Bearbeiter:in
// per Unternehmens-IdP an. Der Hinweisgeber-Pfad bleibt unberuehrt (kein IdP,
// keine Accounts, anonym ueber Token).
//
// Design-Entscheidungen (Sicherheit):
//   - Authorization-Code-Flow mit PKCE (S256) + state (CSRF-Schutz).
//   - KEIN Auto-Provisioning: existiert keine Bearbeiter:in mit der verifizierten
//     E-Mail, wird der Login abgelehnt. Der IdP kann keine Konten/ Rollen anlegen.
//   - MFA wird an den IdP delegiert (SSO-Standard) — daher kein lokaler TOTP-Schritt.
//   - Identitaet wird server-to-server am userinfo-Endpoint (HTTPS) geholt, statt
//     selbstgebauter ID-Token-/JWT-Pruefung. Robust, ohne Krypto-Eigenbau.
//   - Vollstaendig abschaltbar: ohne Konfiguration ist SSO inaktiv.

import { createHash, randomBytes } from 'node:crypto';

export interface OidcConfig {
  issuerLabel: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
}

/** Liest die OIDC-Konfiguration aus der Umgebung; null, wenn nicht (vollstaendig) gesetzt. */
export function getOidcConfig(): OidcConfig | null {
  const authorizationEndpoint = process.env.OIDC_AUTHORIZATION_ENDPOINT;
  const tokenEndpoint = process.env.OIDC_TOKEN_ENDPOINT;
  const userinfoEndpoint = process.env.OIDC_USERINFO_ENDPOINT;
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;
  const redirectUri = process.env.OIDC_REDIRECT_URI;
  if (
    !authorizationEndpoint ||
    !tokenEndpoint ||
    !userinfoEndpoint ||
    !clientId ||
    !clientSecret ||
    !redirectUri
  ) {
    return null;
  }
  return {
    issuerLabel: process.env.OIDC_ISSUER_LABEL || 'SSO',
    authorizationEndpoint,
    tokenEndpoint,
    userinfoEndpoint,
    clientId,
    clientSecret,
    redirectUri,
    scope: process.env.OIDC_SCOPE || 'openid email',
  };
}

/** Ist SSO konfiguriert/aktiv? */
export function isOidcEnabled(): boolean {
  return getOidcConfig() !== null;
}

function base64url(buf: Buffer): string {
  return buf.toString('base64url');
}

/** Erzeugt einen PKCE-Verifier (43–128 Zeichen) + zugehoerige S256-Challenge. */
export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

/** Erzeugt einen zufaelligen state-Wert (CSRF-Schutz). */
export function generateState(): string {
  return base64url(randomBytes(16));
}

/** Baut die Authorization-URL fuer den Redirect zum IdP. */
export function buildAuthorizationUrl(
  config: OidcConfig,
  args: { state: string; codeChallenge: string },
): string {
  const url = new URL(config.authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('scope', config.scope);
  url.searchParams.set('state', args.state);
  url.searchParams.set('code_challenge', args.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

/** Tauscht den Authorization-Code gegen ein Access-Token (mit PKCE-Verifier). */
export async function exchangeCode(
  config: OidcConfig,
  args: { code: string; codeVerifier: string },
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: args.code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: args.codeVerifier,
  });
  const res = await fetch(config.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string };
  if (!res.ok || !json.access_token) {
    throw new Error('Token-Austausch fehlgeschlagen.');
  }
  return json.access_token;
}

export interface OidcIdentity {
  email: string;
  emailVerified: boolean;
}

/** Holt die Identitaet (verifizierte E-Mail) vom userinfo-Endpoint. */
export async function fetchUserinfo(
  config: OidcConfig,
  accessToken: string,
): Promise<OidcIdentity> {
  const res = await fetch(config.userinfoEndpoint, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  const json = (await res.json().catch(() => ({}))) as {
    email?: unknown;
    email_verified?: unknown;
  };
  const email = typeof json.email === 'string' ? json.email.trim().toLowerCase() : '';
  // email_verified kann boolean oder String ("true") sein (je nach IdP).
  const emailVerified = json.email_verified === true || json.email_verified === 'true';
  if (!email) {
    throw new Error('Keine E-Mail im userinfo-Profil.');
  }
  return { email, emailVerified };
}
