import type { Metadata } from 'next';
import Link from 'next/link';
import { KeyEnrollment } from '@/components/KeyEnrollment';
import { requireAdminSession } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Meine Schlüssel — HinSchG',
};

export default async function KeysPage() {
  const session = await requireAdminSession(['ADMIN', 'HANDLER']);
  const handler = await prisma.handler.findUnique({
    where: { id: session.h },
    select: { publicKey: true },
  });
  const enrolled = Boolean(handler?.publicKey);

  return (
    <main id="hauptinhalt" tabIndex={-1} className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <Link
          href="/admin"
          className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          ← Dashboard
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Meine Schlüssel</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Persönliches Schlüsselpaar für die Ende-zu-Ende-Verschlüsselung (Stufe 2).
        </p>
      </header>

      <section className="flex flex-col gap-4">
        {enrolled ? (
          <div className="flex flex-col gap-2 rounded-md border border-green-300 bg-green-50 p-4 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-200">
            <p className="font-medium">Schlüsselpaar ist eingerichtet.</p>
            <p className="break-all font-mono text-xs">
              Public Key: {handler?.publicKey?.slice(0, 24)}…
            </p>
          </div>
        ) : (
          <KeyEnrollment />
        )}
      </section>
    </main>
  );
}
