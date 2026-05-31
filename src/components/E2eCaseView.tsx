'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

interface E2eMessage {
  id: string;
  direction: 'FROM_OFFICE' | 'FROM_WHISTLEBLOWER';
  nonce: string;
  content: string;
  wrap: string | null;
  createdAt: string;
}

export interface E2eCaseData {
  caseId: string;
  recipientId: string;
  publicKey: string | null;
  encryptedPrivateKey: string | null;
  report: { nonce: string; content: string; wrap: string | null } | null;
  messages: E2eMessage[];
  replyRecipients: Record<string, string>;
}

interface DecryptedReport {
  description: string;
  incidentDate: string | null;
  contact: string | null;
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function E2eCaseView({ data }: { data: E2eCaseData }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const privateKeyRef = useRef<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<DecryptedReport | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  const notEnrolled = !data.encryptedPrivateKey || !data.publicKey;
  const notRecipient = !data.report?.wrap;

  // Entschlüsselt Meldung + Nachrichten mit dem (entsperrten) privaten Schlüssel.
  const decryptAll = useCallback(async () => {
    const priv = privateKeyRef.current;
    if (!priv || !data.publicKey) return;
    const e2e = await import('@/lib/e2e');
    const open = (nonce: string, content: string, wrap: string) =>
      e2e.decryptFromRecipient(
        { nonce, content, wraps: { [data.recipientId]: wrap } },
        data.recipientId,
        data.publicKey as string,
        priv,
      );

    if (data.report?.wrap) {
      try {
        const parsed = JSON.parse(
          await open(data.report.nonce, data.report.content, data.report.wrap),
        ) as Partial<DecryptedReport>;
        setReport({
          description: parsed.description ?? '',
          incidentDate: parsed.incidentDate ?? null,
          contact: parsed.contact ?? null,
        });
      } catch {
        setReport({
          description: '[Entschlüsselung fehlgeschlagen]',
          incidentDate: null,
          contact: null,
        });
      }
    }

    const out: Record<string, string> = {};
    for (const m of data.messages) {
      if (!m.wrap) continue;
      try {
        out[m.id] = await open(m.nonce, m.content, m.wrap);
      } catch {
        out[m.id] = '[Entschlüsselung fehlgeschlagen]';
      }
    }
    setMessages(out);
  }, [data]);

  // Bei neuen Server-Daten (nach Antwort) erneut entschlüsseln, wenn entsperrt.
  useEffect(() => {
    if (unlocked) void decryptAll();
  }, [unlocked, decryptAll]);

  async function handleUnlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const password = String(new FormData(event.currentTarget).get('password') ?? '');
    try {
      const e2e = await import('@/lib/e2e');
      const priv = await e2e.decryptPrivateKey(
        JSON.parse(data.encryptedPrivateKey as string),
        password,
      );
      privateKeyRef.current = priv;
      setUnlocked(true);
    } catch {
      setError('Entsperren fehlgeschlagen — Passwort falsch?');
    } finally {
      setBusy(false);
    }
  }

  async function handleReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const body = String(new FormData(event.currentTarget).get('body') ?? '');
    try {
      const e2e = await import('@/lib/e2e');
      const ct = await e2e.encryptForRecipients(body, data.replyRecipients);
      const response = await fetch(`/api/admin/cases/${data.caseId}/e2e-messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: { nonce: ct.nonce, content: ct.content },
          wraps: ct.wraps,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? 'Antwort konnte nicht gesendet werden.');
        return;
      }
      formRef.current?.reset();
      router.refresh();
    } catch {
      setError('Netzwerk- oder Verschlüsselungsfehler.');
    } finally {
      setBusy(false);
    }
  }

  if (notEnrolled) {
    return (
      <div className="rounded-md border border-amber-400 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-100">
        Sie haben noch kein Schlüsselpaar eingerichtet. Bitte zuerst unter{' '}
        <Link href="/admin/keys" className="underline">
          Meine Schlüssel
        </Link>{' '}
        einrichten.
      </div>
    );
  }

  if (!unlocked) {
    return (
      <form onSubmit={handleUnlock} className="flex max-w-sm flex-col gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Dieser Fall ist Ende-zu-Ende-verschlüsselt. Entsperren Sie Ihren privaten Schlüssel mit
          Ihrem Passwort, um Inhalt und Verlauf im Browser zu entschlüsseln.
        </p>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          placeholder="Passwort"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="self-start rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-accent disabled:opacity-60"
        >
          {busy ? 'Entsperre …' : 'Entsperren & entschlüsseln'}
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {notRecipient ? (
        <div className="rounded-md border border-amber-400 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-100">
          Für Ihren Schlüssel liegt kein Zugriff auf diesen Fall vor (Sie wurden nach der Meldung
          hinzugefügt). Eine Wiederherstellung ist über den Org-Recovery-Schlüssel möglich.
        </div>
      ) : (
        <article className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Hinweisgeber (Meldung) · entschlüsselt im Browser
          </div>
          <p className="whitespace-pre-wrap break-words">{report?.description}</p>
          {(report?.incidentDate || report?.contact) && (
            <dl className="mt-3 grid gap-1 border-t border-slate-200 pt-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {report?.incidentDate && (
                <div className="flex gap-2">
                  <dt>Vorfallszeitpunkt:</dt>
                  <dd>{report.incidentDate}</dd>
                </div>
              )}
              {report?.contact && (
                <div className="flex gap-2">
                  <dt>Freiwillige Kontaktangabe:</dt>
                  <dd className="break-all">{report.contact}</dd>
                </div>
              )}
            </dl>
          )}
        </article>
      )}

      {data.messages.map((m) => {
        const fromOffice = m.direction === 'FROM_OFFICE';
        return (
          <article
            key={m.id}
            className={`rounded-md border p-4 ${
              fromOffice
                ? 'border-brand/30 bg-brand/5'
                : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900'
            }`}
          >
            <div className="mb-1 flex justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium">{fromOffice ? 'Meldestelle' : 'Hinweisgeber'}</span>
              <span>{formatDateTime(m.createdAt)}</span>
            </div>
            <p className="whitespace-pre-wrap break-words">{messages[m.id] ?? '…'}</p>
          </article>
        );
      })}

      <form
        ref={formRef}
        onSubmit={handleReply}
        className="mt-3 flex flex-col gap-3 border-t border-slate-200 pt-4 dark:border-slate-800"
      >
        <label htmlFor="body" className="text-sm font-medium">
          Antwort an den Hinweisgeber (Ende-zu-Ende-verschlüsselt)
        </label>
        <textarea
          id="body"
          name="body"
          required
          rows={4}
          maxLength={20000}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="self-start rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-accent disabled:opacity-60"
        >
          {busy ? 'Wird gesendet …' : 'Verschlüsselt antworten'}
        </button>
      </form>
    </div>
  );
}
