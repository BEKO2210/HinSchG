import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdminSession } from '@/lib/admin-auth';
import { AUDIT_ACTIONS, isAuditAction } from '@/lib/audit';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Audit-Trail — HinSchG',
};

const PAGE_SIZE = 50;

function formatDateTime(value: Date): string {
  return value.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'medium' });
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: { action?: string; caseId?: string; page?: string };
}) {
  // Nur ADMIN und AUDITOR; serverseitig erzwungen.
  const session = requireAdminSession(['ADMIN', 'AUDITOR']);

  const actionFilter = isAuditAction(searchParams.action) ? searchParams.action : undefined;
  const caseIdFilter = searchParams.caseId?.trim() || undefined;
  const page = Math.max(1, Number(searchParams.page ?? '1') || 1);

  // Mandantentrennung: nur Audit-Eintraege der eigenen Meldestelle.
  const where: Prisma.AuditLogWhereInput = { officeId: session.o };
  if (actionFilter) {
    where.action = actionFilter;
  }
  if (caseIdFilter) {
    where.caseId = caseIdFilter;
  }

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        createdAt: true,
        actorType: true,
        actorId: true,
        action: true,
        caseId: true,
        metadata: true,
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main id="hauptinhalt" tabIndex={-1} className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <Link
          href="/admin"
          className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          ← Dashboard
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Audit-Trail</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Lückenlos und append-only (auf Datenbankebene erzwungen). Einträge können nicht geändert
          oder gelöscht werden.
        </p>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-500 dark:text-slate-400">Aktion</span>
          <select
            name="action"
            defaultValue={actionFilter ?? ''}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">Alle</option>
            {AUDIT_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-500 dark:text-slate-400">Fall-ID</span>
          <input
            name="caseId"
            defaultValue={caseIdFilter ?? ''}
            placeholder="vollständige Fall-ID"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-accent"
        >
          Filtern
        </button>
        <Link
          href="/admin/audit"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
        >
          Zurücksetzen
        </Link>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th className="py-2 pr-4 font-medium">Zeitpunkt</th>
              <th className="py-2 pr-4 font-medium">Akteur</th>
              <th className="py-2 pr-4 font-medium">Aktion</th>
              <th className="py-2 pr-4 font-medium">Fall</th>
              <th className="py-2 pr-4 font-medium">Metadaten</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-500 dark:text-slate-400">
                  Keine Einträge.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="border-b border-slate-100 dark:border-slate-900">
                  <td className="whitespace-nowrap py-2 pr-4">{formatDateTime(entry.createdAt)}</td>
                  <td className="py-2 pr-4">
                    {entry.actorType}
                    {entry.actorId ? (
                      <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                        {' '}
                        {entry.actorId.slice(0, 8)}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-4 font-medium">{entry.action}</td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    {entry.caseId ? entry.caseId.slice(0, 8) : '—'}
                  </td>
                  <td className="py-2 pr-4 text-xs text-slate-500 dark:text-slate-400">
                    {entry.metadata ? JSON.stringify(entry.metadata) : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <nav className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
        <span>
          {total} Einträge · Seite {page} von {totalPages}
        </span>
        <span className="flex gap-2">
          {page > 1 && (
            <Link
              href={{ pathname: '/admin/audit', query: { ...searchParams, page: page - 1 } }}
              className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
            >
              Zurück
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={{ pathname: '/admin/audit', query: { ...searchParams, page: page + 1 } }}
              className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
            >
              Weiter
            </Link>
          )}
        </span>
      </nav>
    </main>
  );
}
