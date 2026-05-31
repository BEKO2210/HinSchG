import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminLogoutButton } from '@/components/AdminLogoutButton';
import { DeadlineBadge } from '@/components/DeadlineBadge';
import { ProcessingRequestButton } from '@/components/ProcessingRequestButton';
import { requireAdminSession } from '@/lib/admin-auth';
import { categoryLabel } from '@/lib/cases';
import { caseStatusLabel, severityLabel } from '@/lib/case-status';
import { prisma } from '@/lib/db';
import {
  ACK_WARN_MS,
  FEEDBACK_WARN_MS,
  caseUrgency,
  formatDeadlineRelative,
  trafficLight,
} from '@/lib/deadlines';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Fall-Dashboard — HinSchG',
};

function formatDate(value: Date): string {
  return value.toLocaleDateString('de-DE', { dateStyle: 'medium' });
}

export default async function AdminPage() {
  const session = requireAdminSession();
  // SUPERADMIN verwaltet ausschließlich Meldestellen (kein Fall-Dashboard).
  if (session.r === 'SUPERADMIN') {
    redirect('/admin/offices');
  }
  // AUDITOR hat ausschließlich Lesezugriff auf den Audit-Trail.
  if (session.r === 'AUDITOR') {
    redirect('/admin/audit');
  }
  const handler = await prisma.handler.findUnique({
    where: { id: session.h },
    select: { email: true, role: true },
  });

  // Phase 11a: Status der "Fallbearbeitung durch Befugte"-Anfrage (nur für ADMIN
  // relevant; setzt keine Zugriffsrechte).
  const officeProcessing =
    session.r === 'ADMIN'
      ? await prisma.reportingOffice.findUnique({
          where: { id: session.o },
          select: { managedProcessing: true, processingRequest: true },
        })
      : null;
  const processingStatus = officeProcessing?.managedProcessing
    ? ('ACTIVE' as const)
    : (officeProcessing?.processingRequest ?? 'NONE');

  const cases = await prisma.case.findMany({
    // Mandantentrennung: ausschliesslich Faelle der eigenen Meldestelle.
    where: { officeId: session.o },
    select: {
      id: true,
      status: true,
      category: true,
      severity: true,
      createdAt: true,
      deadlineAck: true,
      deadlineFeedback: true,
      acknowledgedAt: true,
      feedbackSentAt: true,
    },
  });

  const now = Date.now();
  const rows = cases
    .map((c) => ({
      ...c,
      urgency: caseUrgency(
        c.deadlineAck,
        c.acknowledgedAt !== null,
        c.deadlineFeedback,
        c.feedbackSentAt !== null,
        now,
      ),
      ackLevel: trafficLight(c.deadlineAck, c.acknowledgedAt !== null, ACK_WARN_MS, now),
      feedbackLevel: trafficLight(
        c.deadlineFeedback,
        c.feedbackSentAt !== null,
        FEEDBACK_WARN_MS,
        now,
      ),
    }))
    .sort((a, b) => a.urgency - b.urgency);

  return (
    <main id="hauptinhalt" tabIndex={-1} className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">Fall-Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Angemeldet als {handler?.email} · Rolle {handler?.role ?? session.r}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/keys"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
          >
            Schlüssel
          </Link>
          <Link
            href="/admin/audit"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
          >
            Audit
          </Link>
          {session.r === 'ADMIN' && (
            <>
              <ProcessingRequestButton status={processingStatus} />
              <Link
                href="/admin/handlers"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
              >
                Bearbeiter
              </Link>
              <Link
                href="/admin/e2e"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
              >
                E2E
              </Link>
            </>
          )}
          <AdminLogoutButton />
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Es liegen noch keine Meldungen vor.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-2 pr-4 font-medium">Fall</th>
                <th className="py-2 pr-4 font-medium">Eingang</th>
                <th className="py-2 pr-4 font-medium">Kategorie</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Schwere</th>
                <th className="py-2 pr-4 font-medium">Eingangsbestätigung</th>
                <th className="py-2 pr-4 font-medium">Rückmeldung</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-900/50"
                >
                  <td className="py-2 pr-4">
                    <Link
                      href={`/admin/cases/${row.id}`}
                      className="font-mono text-brand hover:underline"
                    >
                      {row.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4">{formatDate(row.createdAt)}</td>
                  <td className="py-2 pr-4">{categoryLabel(row.category)}</td>
                  <td className="whitespace-nowrap py-2 pr-4">{caseStatusLabel(row.status)}</td>
                  <td className="whitespace-nowrap py-2 pr-4">{severityLabel(row.severity)}</td>
                  <td className="py-2 pr-4">
                    <DeadlineBadge
                      level={row.ackLevel}
                      label={
                        row.acknowledgedAt
                          ? 'bestätigt'
                          : formatDeadlineRelative(row.deadlineAck, now)
                      }
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <DeadlineBadge
                      level={row.feedbackLevel}
                      label={
                        row.feedbackSentAt
                          ? 'erfolgt'
                          : formatDeadlineRelative(row.deadlineFeedback, now)
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
