import type { Metadata } from 'next';
import Link from 'next/link';
import { CreateHandlerForm } from '@/components/CreateHandlerForm';
import { HandlerResetForm } from '@/components/HandlerResetForm';
import { requireAdminSession } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Bearbeiter — HinSchG',
};

export default async function HandlersPage() {
  requireAdminSession(['ADMIN']);

  const handlers = await prisma.handler.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      email: true,
      role: true,
      totpSecret: true,
      publicKey: true,
      createdAt: true,
    },
  });

  return (
    <main id="hauptinhalt" tabIndex={-1} className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <Link
          href="/admin"
          className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          ← Meldestelle
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Bearbeiter</h1>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Vorhandene Bearbeiter</h2>
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {handlers.map((handler) => (
            <li key={handler.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span className="font-medium">{handler.email}</span>
              <span className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                <span>{handler.role}</span>
                <span
                  className={
                    handler.totpSecret
                      ? 'text-green-700 dark:text-green-400'
                      : 'text-amber-700 dark:text-amber-400'
                  }
                >
                  {handler.totpSecret ? '2FA aktiv' : '2FA ausstehend'}
                </span>
                <span
                  className={
                    handler.publicKey
                      ? 'text-green-700 dark:text-green-400'
                      : 'text-amber-700 dark:text-amber-400'
                  }
                >
                  {handler.publicKey ? 'Schlüssel aktiv' : 'Schlüssel ausstehend'}
                </span>
                <HandlerResetForm handlerId={handler.id} email={handler.email} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3 border-t border-slate-200 pt-6 dark:border-slate-800">
        <h2 className="text-lg font-semibold">Neuen Bearbeiter anlegen</h2>
        <CreateHandlerForm />
      </section>
    </main>
  );
}
