import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminLogoutButton } from '@/components/AdminLogoutButton';
import { requireAdminSession } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Meldestelle — HinSchG',
};

export default async function AdminPage() {
  const session = requireAdminSession();
  const handler = await prisma.handler.findUnique({
    where: { id: session.h },
    select: { email: true, role: true },
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">Meldestelle</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Angemeldet als {handler?.email} · Rolle {handler?.role ?? session.r}
          </p>
        </div>
        <AdminLogoutButton />
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        {session.r === 'ADMIN' && (
          <Link
            href="/admin/handlers"
            className="rounded-md border border-slate-200 p-4 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
          >
            <h2 className="font-medium">Bearbeiter verwalten</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Weitere Bearbeiter anlegen und Rollen vergeben.
            </p>
          </Link>
        )}
        <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Das Fall-Dashboard (Liste, Fristen-Ampel, Bearbeitung) folgt in der naechsten Phase.
        </div>
      </section>
    </main>
  );
}
