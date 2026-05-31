// HinSchG — Validierung beim Anlegen von Bearbeitern (durch ADMIN)
// Pur (kein IO), damit unit-testbar.

import type { HandlerRole } from './session';

export const HANDLER_ROLES: readonly HandlerRole[] = ['ADMIN', 'HANDLER', 'AUDITOR'];

// Mindestlaenge fuer Bearbeiter-Passwoerter (Argon2id schuetzt zusaetzlich).
export const HANDLER_PASSWORD_MIN = 12;

// Pragmatische E-Mail-Pruefung (eine Form, kein Klartext-Versand im MVP).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface HandlerInput {
  email: string;
  password: string;
  role: HandlerRole;
}

export type HandlerValidation = { ok: true; value: HandlerInput } | { ok: false; error: string };

export function validateHandlerInput(raw: unknown): HandlerValidation {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Ungueltige Anfrage.' };
  }
  const body = raw as Record<string, unknown>;

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: 'Bitte eine gueltige E-Mail-Adresse angeben.' };
  }

  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < HANDLER_PASSWORD_MIN) {
    return {
      ok: false,
      error: `Das Passwort muss mindestens ${HANDLER_PASSWORD_MIN} Zeichen lang sein.`,
    };
  }

  const role = typeof body.role === 'string' ? (body.role as HandlerRole) : ('' as HandlerRole);
  if (!HANDLER_ROLES.includes(role)) {
    return { ok: false, error: 'Unbekannte Rolle.' };
  }

  return { ok: true, value: { email, password, role } };
}
