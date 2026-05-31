import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminLogin } from '@/components/AdminLogin';
import { SiteHeader } from '@/components/SiteHeader';
import { getAdminSession } from '@/lib/admin-auth';
import { isOidcEnabled } from '@/lib/oidc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Bearbeiter-Login — HinSchG',
};

const SSO_ERRORS: Record<string, string> = {
  ungueltig: 'Die SSO-Anmeldung war ungültig oder ist abgelaufen. Bitte erneut versuchen.',
  fehlgeschlagen: 'Die SSO-Anmeldung ist fehlgeschlagen.',
  email_unbestaetigt: 'Ihre E-Mail-Adresse ist beim Identitätsanbieter nicht bestätigt.',
  kein_konto: 'Für diese E-Mail existiert kein Bearbeiter-Konto.',
};

export default async function AdminLoginPage({
  searchParams,
}: {
  // Next 15: searchParams ist ein Promise.
  searchParams: Promise<{ sso_error?: string }>;
}) {
  if (await getAdminSession()) {
    redirect('/admin');
  }
  const ssoEnabled = isOidcEnabled();
  const { sso_error } = await searchParams;
  const ssoError = sso_error ? SSO_ERRORS[sso_error] : undefined;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <SiteHeader />
        <Link
          href="/"
          className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          ← Startseite
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Meldestelle — Anmeldung</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Zugang nur für Bearbeiter:innen. Zwei-Faktor-Authentifizierung ist verpflichtend.
        </p>
      </header>
      {ssoError && (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
        >
          {ssoError}
        </p>
      )}

      {ssoEnabled && (
        <div className="flex flex-col gap-3">
          <a
            href="/api/admin/sso/start"
            className="rounded-md border border-slate-300 px-4 py-2.5 text-center font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
          >
            Mit SSO anmelden
          </a>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            oder mit E-Mail &amp; Passwort
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          </div>
        </div>
      )}

      <AdminLogin />
    </main>
  );
}
