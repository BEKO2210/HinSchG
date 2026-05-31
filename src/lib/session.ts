// HinSchG — Kurzlebige, an einen Fall gebundene Postfach-Session
//
// Bewusst KEINE Accounts und KEINE Session-Tabelle: Der Hinweisgeber-Zugang ist
// rein token-basiert. Nach erfolgreicher Token-Pruefung erhaelt der Client ein
// signiertes, kurzlebiges httpOnly-Cookie, das ausschliesslich die caseId +
// Ablaufzeit traegt. Es ist HMAC-signiert (SESSION_SECRET) und damit nicht
// manipulierbar; bei Ablauf ist es ungueltig (kein dauerhafter Login).

import { createHmac, timingSafeEqual } from 'node:crypto';

export const INBOX_COOKIE = 'hinschg_inbox';
export const INBOX_SESSION_TTL_SECONDS = 30 * 60; // 30 Minuten

interface SessionPayload {
  /** caseId */
  c: string;
  /** Ablauf (Unix-Sekunden) */
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

function sign(data: string): string {
  return createHmac('sha256', getSessionSecret()).update(data).digest('base64url');
}

/**
 * Erstellt einen signierten Session-Wert fuer einen Fall.
 * Rueckgabe enthaelt den Cookie-Wert und die maxAge in Sekunden.
 */
export function createInboxSession(caseId: string): { value: string; maxAgeSeconds: number } {
  const payload: SessionPayload = {
    c: caseId,
    exp: Math.floor(Date.now() / 1000) + INBOX_SESSION_TTL_SECONDS,
  };
  const encoded = b64url(JSON.stringify(payload));
  const value = `${encoded}.${sign(encoded)}`;
  return { value, maxAgeSeconds: INBOX_SESSION_TTL_SECONDS };
}

/**
 * Verifiziert einen Session-Cookie-Wert und gibt die caseId zurueck — oder
 * null, wenn die Signatur ungueltig oder die Session abgelaufen ist.
 */
export function verifyInboxSession(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const dot = value.indexOf('.');
  if (dot <= 0) {
    return null;
  }
  const encoded = value.slice(0, dot);
  const signature = value.slice(dot + 1);

  const expected = sign(encoded);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
  } catch {
    return null;
  }
  if (typeof payload.c !== 'string' || typeof payload.exp !== 'number') {
    return null;
  }
  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload.c;
}

/** Cookie-Optionen fuer das Setzen/Loeschen der Session. */
export function inboxCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
