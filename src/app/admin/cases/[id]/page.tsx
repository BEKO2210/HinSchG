import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AcknowledgeButton } from '@/components/AcknowledgeButton';
import { CaseStatusControls } from '@/components/CaseStatusControls';
import { DeadlineBadge } from '@/components/DeadlineBadge';
import { OfficeReplyForm } from '@/components/OfficeReplyForm';
import { requireAdminSession } from '@/lib/admin-auth';
import { categoryLabel } from '@/lib/cases';
import { caseStatusLabel, severityLabel } from '@/lib/case-status';
import { decryptPayload } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import {
  ACK_WARN_MS,
  FEEDBACK_WARN_MS,
  formatDeadlineRelative,
  trafficLight,
} from '@/lib/deadlines';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Fall — HinSchG',
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

export default async function AdminCasePage({ params }: { params: { id: string } }) {
  const session = requireAdminSession(['ADMIN', 'HANDLER']);

  const found = await prisma.case.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      severity: true,
      category: true,
      encryptionVersion: true,
      encryptedPayload: true,
      acknowledgedAt: true,
      feedbackSentAt: true,
      deadlineAck: true,
      deadlineFeedback: true,
      createdAt: true,
      messages: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, direction: true, encryptedBody: true, createdAt: true },
      },
      statusHistory: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, fromStatus: true, toStatus: true, createdAt: true },
      },
    },
  });

  if (!found) {
    notFound();
  }

  // Lesezugriff protokollieren (jeder Fallzugriff ist nachvollziehbar).
  await prisma.auditLog.create({
    data: { actorType: 'HANDLER', actorId: session.h, action: 'CASE_VIEWED', caseId: found.id },
  });

  const isE2e = found.encryptionVersion === 2;
  const report = isE2e
    ? { description: '', incidentDate: null, contact: null }
    : parseReport(found.encryptedPayload);
  const now = Date.now();
  const ackLevel = trafficLight(found.deadlineAck, found.acknowledgedAt !== null, ACK_WARN_MS, now);
  const feedbackLevel = trafficLight(
    found.deadlineFeedback,
    found.feedbackSentAt !== null,
    FEEDBACK_WARN_MS,
    now,
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <Link
          href="/admin"
          className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Fall <span className="font-mono">{found.id.slice(0, 8)}</span>
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Eingegangen am {formatDateTime(found.createdAt)} · {categoryLabel(found.category)}
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-md border border-slate-200 p-4 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <AcknowledgeButton caseId={found.id} acknowledged={found.acknowledgedAt !== null} />
          <div className="flex flex-wrap gap-2">
            <DeadlineBadge
              level={ackLevel}
              label={`Eingang: ${found.acknowledgedAt ? 'bestätigt' : formatDeadlineRelative(found.deadlineAck, now)}`}
            />
            <DeadlineBadge
              level={feedbackLevel}
              label={`Rückmeldung: ${found.feedbackSentAt ? 'erfolgt' : formatDeadlineRelative(found.deadlineFeedback, now)}`}
            />
          </div>
        </div>
        <CaseStatusControls caseId={found.id} status={found.status} severity={found.severity} />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Aktuell: {caseStatusLabel(found.status)} · {severityLabel(found.severity)}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Meldung &amp; Verlauf</h2>

        {isE2e ? (
          <div className="rounded-md border border-brand/40 bg-brand/5 p-4 text-sm">
            <p className="font-medium">Ende-zu-Ende-verschlüsselt (Stufe 2)</p>
            <p className="mt-1 text-slate-600 dark:text-slate-300">
              Dieser Fall ist Ende-zu-Ende-verschlüsselt; der Server kann den Inhalt nicht
              entschlüsseln. Die Anzeige und Beantwortung im Browser (mit Ihrem entsperrten
              Schlüssel) wird in Kürze ergänzt.
            </p>
          </div>
        ) : (
          <>
            <article className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-1 flex justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-medium">Hinweisgeber (Meldung)</span>
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
                      <dt>Freiwillige Kontaktangabe:</dt>
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
                    <span className="font-medium">
                      {fromOffice ? 'Meldestelle' : 'Hinweisgeber'}
                    </span>
                    <span>{formatDateTime(message.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words">
                    {safeDecrypt(message.encryptedBody)}
                  </p>
                </article>
              );
            })}
          </>
        )}
      </section>

      {!isE2e && (
        <section className="border-t border-slate-200 pt-6 dark:border-slate-800">
          <OfficeReplyForm caseId={found.id} />
        </section>
      )}
    </main>
  );
}
