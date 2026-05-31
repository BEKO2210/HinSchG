import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AcknowledgeButton } from '@/components/AcknowledgeButton';
import { CaseStatusControls } from '@/components/CaseStatusControls';
import { DeadlineBadge } from '@/components/DeadlineBadge';
import { E2eCaseView, type E2eCaseData } from '@/components/E2eCaseView';
import { OfficeReplyForm } from '@/components/OfficeReplyForm';
import { RecoveryUse } from '@/components/RecoveryUse';
import { RECIPIENT_RECOVERY, RECIPIENT_WHISTLEBLOWER } from '@/lib/cases';
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
      wbPublicKey: true,
      acknowledgedAt: true,
      feedbackSentAt: true,
      deadlineAck: true,
      deadlineFeedback: true,
      createdAt: true,
      keys: { select: { recipient: true, wrappedKey: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          direction: true,
          encryptedBody: true,
          createdAt: true,
          keys: { select: { recipient: true, wrappedKey: true } },
        },
      },
      office: {
        select: {
          recoveryPublicKey: true,
          handlers: {
            where: { publicKey: { not: null } },
            select: { id: true, publicKey: true },
          },
        },
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

  // Für Stufe 2 die (öffentlichen) Empfängerschlüssel + den eigenen
  // (passwortverschlüsselten) privaten Schlüssel für die Browser-Entschlüsselung
  // zusammenstellen. Der Server entschlüsselt nichts.
  let e2eData: E2eCaseData | null = null;
  if (isE2e) {
    const self = await prisma.handler.findUnique({
      where: { id: session.h },
      select: { publicKey: true, encryptedPrivateKey: true },
    });
    const replyRecipients: Record<string, string> = {};
    if (found.office.recoveryPublicKey)
      replyRecipients[RECIPIENT_RECOVERY] = found.office.recoveryPublicKey;
    if (found.wbPublicKey) replyRecipients[RECIPIENT_WHISTLEBLOWER] = found.wbPublicKey;
    for (const h of found.office.handlers) {
      if (h.publicKey) replyRecipients[h.id] = h.publicKey;
    }
    const reportPayload = JSON.parse(found.encryptedPayload) as { nonce: string; content: string };
    e2eData = {
      caseId: found.id,
      recipientId: session.h,
      publicKey: self?.publicKey ?? null,
      encryptedPrivateKey: self?.encryptedPrivateKey ?? null,
      report: {
        nonce: reportPayload.nonce,
        content: reportPayload.content,
        wrap: found.keys.find((k) => k.recipient === session.h)?.wrappedKey ?? null,
      },
      messages: found.messages.map((m) => {
        const body = JSON.parse(m.encryptedBody) as { nonce: string; content: string };
        return {
          id: m.id,
          direction: m.direction,
          nonce: body.nonce,
          content: body.content,
          wrap: m.keys.find((k) => k.recipient === session.h)?.wrappedKey ?? null,
          createdAt: m.createdAt.toISOString(),
        };
      }),
      replyRecipients,
    };
  }

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

        {isE2e && e2eData ? (
          <E2eCaseView data={e2eData} />
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

      {isE2e && session.r === 'ADMIN' && <RecoveryUse caseId={found.id} />}
    </main>
  );
}
