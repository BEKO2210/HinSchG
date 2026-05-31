// HinSchG — Serverseitige Durchsetzung der Bearbeiter-Authentifizierung/-Rollen
//
// Wird in jeder geschützten /admin-Seite und API-Route verwendet. Die Rollen
// werden serverseitig erzwungen, nicht nur in der UI.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, type AdminSession, type HandlerRole, verifyAdminSession } from './session';

/** Liest die Admin-Session aus dem Cookie (oder null). */
export function getAdminSession(): AdminSession | null {
  return verifyAdminSession(cookies().get(ADMIN_COOKIE)?.value);
}

/**
 * Für API-Routen: prüft Session + optionale Rollen serverseitig und liefert
 * entweder die Session oder eine fertige Fehlerantwort (401/403).
 */
export function adminApiGuard(
  roles?: readonly HandlerRole[],
): { session: AdminSession } | { error: NextResponse } {
  const session = getAdminSession();
  if (!session) {
    return { error: NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 }) };
  }
  if (roles && !roles.includes(session.r)) {
    return { error: NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 }) };
  }
  return { session };
}

/**
 * Für Server-Components: erzwingt eine gültige Session und optional eine der
 * erlaubten Rollen. Leitet sonst weiter (Login bzw. Dashboard).
 */
export function requireAdminSession(roles?: readonly HandlerRole[]): AdminSession {
  const session = getAdminSession();
  if (!session) {
    redirect('/admin/login');
  }
  if (roles && !roles.includes(session.r)) {
    redirect('/admin');
  }
  return session;
}
