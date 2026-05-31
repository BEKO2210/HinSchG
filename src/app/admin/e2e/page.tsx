import type { Metadata } from 'next';
import Link from 'next/link';
import { RecoveryKeySetup } from '@/components/RecoveryKeySetup';
import { requireAdminSession } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ende-zu-Ende-Verschlüsselung — HinSchG',
};

export default async function E2ePage() {
  requireAdminSession(['ADMIN']);

  const office = await prisma.reportingOffice.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { recoveryPublicKey: true },
  });
  const recoverySet = Boolean(office?.recoveryPublicKey);

  const [handlerTotal, handlerEnrolled] = await Promise.all([
    prisma.handler.count(),
    prisma.handler.count({ where: { publicKey: { not: null } } }),
  ]);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <Link
          href="/admin"
          className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          ← Dashboard
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Ende-zu-Ende-Verschlüsselung</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Stufe 2 (Vorbereitung). Der Org-Recovery-Schlüssel ist die Voraussetzung dafür, dass
          E2E-Fälle im Notfall wiederhergestellt werden können, wenn ein:e Bearbeiter:in das
          Passwort verliert.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Org-Recovery-Schlüssel</h2>
        {recoverySet ? (
          <div className="flex flex-col gap-2 rounded-md border border-green-300 bg-green-50 p-4 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-200">
            <p className="font-medium">Recovery-Schlüssel ist eingerichtet.</p>
            <p className="break-all font-mono text-xs">
              Public Key: {office?.recoveryPublicKey?.slice(0, 24)}…
            </p>
            <p className="text-green-700 dark:text-green-300">
              Bewahren Sie die zugehörige Passphrase weiterhin sicher und getrennt auf.
            </p>
          </div>
        ) : (
          <RecoveryKeySetup />
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-md border border-slate-200 p-4 text-sm dark:border-slate-800">
        <h2 className="text-lg font-semibold">Bearbeiter-Schlüssel</h2>
        <p className="text-slate-600 dark:text-slate-300">
          {handlerEnrolled} von {handlerTotal} Bearbeiter:innen haben ein Schlüsselpaar
          eingerichtet. Erst wenn alle berechtigten Bearbeiter:innen sowie der Recovery-Schlüssel
          vorhanden sind, können neue Meldungen Ende-zu-Ende verschlüsselt werden.
        </p>
      </section>

      <footer className="border-t border-slate-200 pt-6 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        Hinweis: Die clientseitigen E2E-Flows (Meldung, Postfach, Bearbeitung) folgen schrittweise.
        „Zero-Knowledge“ wird erst nach einem externen Security-Audit kommuniziert.
      </footer>
    </main>
  );
}
