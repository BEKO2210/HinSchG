import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminLogin } from '@/components/AdminLogin';
import { getAdminSession } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Bearbeiter-Login — HinSchG',
};

export default function AdminLoginPage() {
  if (getAdminSession()) {
    redirect('/admin');
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
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
      <AdminLogin />
    </main>
  );
}
