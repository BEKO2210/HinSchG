// HinSchG — Serverseitige Durchsetzung der Bearbeiter-Authentifizierung/-Rollen
//
// Wird in jeder geschützten /admin-Seite und API-Route verwendet. Die Rollen
// werden serverseitig erzwungen, nicht nur in der UI.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE, type AdminSession, type HandlerRole, verifyAdminSession } from './session';

/** Liest die Admin-Session aus dem Cookie (oder null). */
export function getAdminSession(): AdminSession | null {
  return verifyAdminSession(cookies().get(ADMIN_COOKIE)?.value);
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
