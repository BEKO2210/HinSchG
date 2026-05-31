// HinSchG — Signierte, kurzlebige Sessions (Cookies, keine DB-Tabelle)
//
// Generischer HMAC-signierter Container (SESSION_SECRET) mit Ablaufzeit, darauf
// aufbauend:
//   - Postfach-Session (Hinweisgeber, an caseId gebunden)
//   - Admin-Session (Bearbeiter, mit Rolle)
//   - Admin-Pre-Auth (Zwischenschritt nach Passwort, vor TOTP-2FA)
//
// Es gibt KEINE Accounts/Sessions in der DB; alles steckt im signierten Cookie.

import { createHmac, timingSafeEqual } from 'node:crypto';

// --- Cookie-Namen + Laufzeiten ----------------------------------------------
export const INBOX_COOKIE = 'hinschg_inbox';
export const INBOX_SESSION_TTL_SECONDS = 30 * 60; // 30 Minuten

export const ADMIN_COOKIE = 'hinschg_admin';
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60; // 60 Minuten

export const ADMIN_PREAUTH_COOKIE = 'hinschg_admin_pre';
export const ADMIN_PREAUTH_TTL_SECONDS = 5 * 60; // 5 Minuten für den 2FA-Schritt

export type HandlerRole = 'SUPERADMIN' | 'ADMIN' | 'HANDLER' | 'AUDITOR';

interface SignedEnvelope<T> {
  d: T;
  exp: number;
}

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('SESSION_SECRET ist nicht gesetzt oder zu kurz (>= 16 Zeichen erforderlich).');
  }
  return secret;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function hmacSign(data: string): string {
  return createHmac('sha256', getSessionSecret()).update(data).digest('base64url');
}

/** Signiert beliebige Daten mit Ablaufzeit; Rückgabe ist der Cookie-Wert. */
function signToken<T>(data: T, ttlSeconds: number): string {
  const envelope: SignedEnvelope<T> = {
    d: data,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = b64url(JSON.stringify(envelope));
  return `${encoded}.${hmacSign(encoded)}`;
}

/** Verifiziert Signatur + Ablauf und gibt die Nutzdaten zurück (oder null). */
function verifyToken<T>(value: string | undefined): T | null {
  if (!value) {
    return null;
  }
  const dot = value.indexOf('.');
  if (dot <= 0) {
    return null;
  }
  const encoded = value.slice(0, dot);
  const signature = value.slice(dot + 1);

  const expected = hmacSign(encoded);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  let envelope: SignedEnvelope<T>;
  try {
    envelope = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedEnvelope<T>;
  } catch {
    return null;
  }
  if (typeof envelope.exp !== 'number' || envelope.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }
  return envelope.d;
}

// --- Cookie-Optionen ---------------------------------------------------------
export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

/** @deprecated Alias für {@link sessionCookieOptions}. */
export const inboxCookieOptions = sessionCookieOptions;

// --- Postfach-Session (Hinweisgeber) ----------------------------------------
export function createInboxSession(caseId: string): { value: string; maxAgeSeconds: number } {
  return {
    value: signToken({ c: caseId }, INBOX_SESSION_TTL_SECONDS),
    maxAgeSeconds: INBOX_SESSION_TTL_SECONDS,
  };
}

export function verifyInboxSession(value: string | undefined): string | null {
  const data = verifyToken<{ c: string }>(value);
  return data && typeof data.c === 'string' ? data.c : null;
}

// --- Admin-Session (Bearbeiter) ---------------------------------------------
export interface AdminSession {
  /** handlerId */
  h: string;
  /** Rolle */
  r: HandlerRole;
  /** officeId (Mandant) — bindet jede Bearbeiter-Aktion an genau eine Meldestelle */
  o: string;
}

export function createAdminSession(
  handlerId: string,
  role: HandlerRole,
  officeId: string,
): { value: string; maxAgeSeconds: number } {
  return {
    value: signToken<AdminSession>(
      { h: handlerId, r: role, o: officeId },
      ADMIN_SESSION_TTL_SECONDS,
    ),
    maxAgeSeconds: ADMIN_SESSION_TTL_SECONDS,
  };
}

export function verifyAdminSession(value: string | undefined): AdminSession | null {
  const data = verifyToken<AdminSession>(value);
  if (!data || typeof data.h !== 'string') {
    return null;
  }
  if (
    data.r !== 'SUPERADMIN' &&
    data.r !== 'ADMIN' &&
    data.r !== 'HANDLER' &&
    data.r !== 'AUDITOR'
  ) {
    return null;
  }
  // Mandantenbindung ist Pflicht: Sessions ohne officeId (z. B. alte Cookies vor
  // der Multi-Tenant-Umstellung) werden verworfen und erzwingen ein Re-Login.
  if (typeof data.o !== 'string' || data.o.length === 0) {
    return null;
  }
  return data;
}

// --- Admin-Pre-Auth (zwischen Passwort und TOTP) ----------------------------
export interface AdminPreAuth {
  /** handlerId */
  h: string;
  /** true, wenn TOTP erstmalig eingerichtet wird */
  setup: boolean;
  /** verschlüsseltes TOTP-Secret (nur während des Setups) */
  s?: string;
}

export function createAdminPreAuth(data: AdminPreAuth): { value: string; maxAgeSeconds: number } {
  return {
    value: signToken<AdminPreAuth>(data, ADMIN_PREAUTH_TTL_SECONDS),
    maxAgeSeconds: ADMIN_PREAUTH_TTL_SECONDS,
  };
}

export function verifyAdminPreAuth(value: string | undefined): AdminPreAuth | null {
  const data = verifyToken<AdminPreAuth>(value);
  if (!data || typeof data.h !== 'string' || typeof data.setup !== 'boolean') {
    return null;
  }
  return data;
}
