import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { InboxLogin } from '@/components/InboxLogin';
import { InboxReplyForm } from '@/components/InboxReplyForm';
import { LogoutButton } from '@/components/LogoutButton';
import { caseStatusLabel } from '@/lib/case-status';
import { decryptPayload } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { INBOX_COOKIE, verifyInboxSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Postfach — HinSchG',
  description: 'Anonymes Postfach: Stand verfolgen und mit der Meldestelle kommunizieren.',
};

interface ReportContent {
  description: string;
  incidentDate: string | null;
  contact: string | null;
}

function safeDecrypt(encoded: string): string {
  try {
    return decryptPayload(encoded);
  } catch {
    return '[Inhalt konnte nicht entschlüsselt werden]';
  }
}

function parseReport(encoded: string): ReportContent {
  try {
    const parsed = JSON.parse(safeDecrypt(encoded)) as Partial<ReportContent>;
    return {
      description: parsed.description ?? '',
      incidentDate: parsed.incidentDate ?? null,
      contact: parsed.contact ?? null,
    };
  } catch {
    return {
      description: '[Inhalt konnte nicht gelesen werden]',
      incidentDate: null,
      contact: null,
    };
  }
}

function formatDateTime(value: Date): string {
  return value.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatDate(value: Date): string {
  return value.toLocaleDateString('de-DE', { dateStyle: 'medium' });
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      {children}
    </main>
  );
}

export default async function PostfachPage() {
  const caseId = verifyInboxSession(cookies().get(INBOX_COOKIE)?.value);

  if (!caseId) {
    return (
      <Shell>
        <header className="flex flex-col gap-3">
          <Link
            href="/"
            className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            ← Startseite
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">Postfach öffnen</h1>
          <p className="text-slate-600 dark:text-slate-300">
            Geben Sie Ihren Zugangscode ein, um den Stand Ihrer Meldung zu sehen und mit der
            Meldestelle zu kommunizieren. Es ist kein Konto nötig.
          </p>
        </header>
        <InboxLogin />
      </Shell>
    );
  }

  const found = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      status: true,
      category: true,
      encryptedPayload: true,
      acknowledgedAt: true,
      deadlineAck: true,
      deadlineFeedback: true,
      createdAt: true,
      messages: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, direction: true, encryptedBody: true, createdAt: true },
      },
    },
  });

  if (!found) {
    // Session zeigt auf einen nicht (mehr) vorhandenen Fall.
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">Fall nicht gefunden</h1>
        <p className="text-slate-600 dark:text-slate-300">Diese Sitzung ist nicht mehr gültig.</p>
        <LogoutButton />
      </Shell>
    );
  }

  const report = parseReport(found.encryptedPayload);

  return (
    <Shell>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Link
            href="/"
            className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            ← Startseite
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">Ihr Postfach</h1>
        </div>
        <LogoutButton />
      </header>

      <section className="grid gap-3 rounded-md border border-slate-200 p-4 text-sm dark:border-slate-800">
        <div className="flex justify-between gap-4">
          <span className="text-slate-500 dark:text-slate-400">Status</span>
          <span className="font-medium">{caseStatusLabel(found.status)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-500 dark:text-slate-400">Eingangsbestätigung</span>
          <span className="font-medium">
            {found.acknowledgedAt
              ? `bestätigt am ${formatDate(found.acknowledgedAt)}`
              : `ausstehend (Frist: ${formatDate(found.deadlineAck)})`}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-500 dark:text-slate-400">Rückmeldung Folgemaßnahmen</span>
          <span className="font-medium">bis {formatDate(found.deadlineFeedback)}</span>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Verlauf</h2>

        <article className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-1 flex justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium">Ihre Meldung</span>
            <span>{formatDateTime(found.createdAt)}</span>
          </div>
          <p className="whitespace-pre-wrap break-words">{report.description}</p>
          {(report.incidentDate || report.contact) && (
            <dl className="mt-3 grid gap-1 border-t border-slate-200 pt-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {report.incidentDate && (
                <div className="flex gap-2">
                  <dt>Vorfallszeitpunkt:</dt>
                  <dd>{report.incidentDate}</dd>
                </div>
              )}
              {report.contact && (
                <div className="flex gap-2">
                  <dt>Ihre Kontaktangabe:</dt>
                  <dd className="break-all">{report.contact}</dd>
                </div>
              )}
            </dl>
          )}
        </article>

        {found.messages.map((message) => {
          const fromOffice = message.direction === 'FROM_OFFICE';
          return (
            <article
              key={message.id}
              className={`rounded-md border p-4 ${
                fromOffice
                  ? 'border-brand/30 bg-brand/5'
                  : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900'
              }`}
            >
              <div className="mb-1 flex justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-medium">{fromOffice ? 'Meldestelle' : 'Sie'}</span>
                <span>{formatDateTime(message.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap break-words">
                {safeDecrypt(message.encryptedBody)}
              </p>
            </article>
          );
        })}
      </section>

      <section className="border-t border-slate-200 pt-6 dark:border-slate-800">
        <InboxReplyForm />
      </section>
    </Shell>
  );
}
