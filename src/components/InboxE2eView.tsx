'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

const WB = 'WB';

interface E2eMessage {
  id: string;
  direction: 'FROM_OFFICE' | 'FROM_WHISTLEBLOWER';
  nonce: string;
  content: string;
  wrap: string | null;
  createdAt: string;
}

export interface InboxAttachmentMeta {
  id: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface InboxE2eData {
  wbPublicKey: string;
  report: { nonce: string; content: string; wrap: string | null } | null;
  messages: E2eMessage[];
  attachments: InboxAttachmentMeta[];
  replyRecipients: Record<string, string>;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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

export function InboxE2eView({ data }: { data: InboxE2eData }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const keyRef = useRef<{ publicKey: string; privateKey: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [needsToken, setNeedsToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<DecryptedReport | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  const decryptWith = useCallback(
    async (privateKey: string, publicKey: string) => {
      const e2e = await import('@/lib/e2e');
      const open = (nonce: string, content: string, wrap: string) =>
        e2e.decryptFromRecipient(
          { nonce, content, wraps: { [WB]: wrap } },
          WB,
          publicKey,
          privateKey,
        );

      if (data.report?.wrap) {
        const parsed = JSON.parse(
          await open(data.report.nonce, data.report.content, data.report.wrap),
        ) as Partial<DecryptedReport>;
        setReport({
          description: parsed.description ?? '',
          incidentDate: parsed.incidentDate ?? null,
          contact: parsed.contact ?? null,
        });
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
    },
    [data],
  );

  const unlockWithToken = useCallback(
    async (token: string): Promise<boolean> => {
      try {
        const e2e = await import('@/lib/e2e');
        const kp = await e2e.deriveWhistleblowerKeyPair(token);
        if (kp.publicKey !== data.wbPublicKey) {
          return false;
        }
        keyRef.current = kp;
        await decryptWith(kp.privateKey, kp.publicKey);
        setReady(true);
        return true;
      } catch {
        return false;
      }
    },
    [data, decryptWith],
  );

  // Beim Laden: Token aus dem sessionStorage des Tabs holen und entschlüsseln.
  useEffect(() => {
    let active = true;
    void (async () => {
      const { WB_TOKEN_STORAGE_KEY } = await import('@/lib/e2e');
      const token = sessionStorage.getItem(WB_TOKEN_STORAGE_KEY);
      if (!token) {
        if (active) setNeedsToken(true);
        return;
      }
      const ok = await unlockWithToken(token);
      if (active && !ok) setNeedsToken(true);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nach einer Antwort (router.refresh) mit dem bereits abgeleiteten Schlüssel neu entschlüsseln.
  useEffect(() => {
    const kp = keyRef.current;
    if (ready && kp) void decryptWith(kp.privateKey, kp.publicKey);
  }, [ready, decryptWith]);

  async function handleTokenSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const token = String(new FormData(event.currentTarget).get('token') ?? '');
    const ok = await unlockWithToken(token);
    if (ok) {
      const { WB_TOKEN_STORAGE_KEY } = await import('@/lib/e2e');
      try {
        sessionStorage.setItem(WB_TOKEN_STORAGE_KEY, token);
      } catch {
        /* ignorieren */
      }
      setNeedsToken(false);
    } else {
      setError('Mit diesem Code konnte nichts entschlüsselt werden.');
    }
    setBusy(false);
  }

  async function handleReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const body = String(new FormData(event.currentTarget).get('body') ?? '');
    try {
      const e2e = await import('@/lib/e2e');
      const ct = await e2e.encryptForRecipients(body, data.replyRecipients);
      const response = await fetch('/api/inbox/e2e-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: { nonce: ct.nonce, content: ct.content },
          wraps: ct.wraps,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? 'Nachricht konnte nicht gesendet werden.');
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

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const { prepareFile, encryptAndUpload } = await import('@/lib/attachments-client');
      const prepared = await prepareFile(file);
      const result = await encryptAndUpload(
        prepared,
        data.replyRecipients,
        '/api/inbox/e2e-attachments',
      );
      if (!result.ok) {
        setError(result.error ?? 'Upload fehlgeschlagen.');
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload(id: string) {
    setError(null);
    const kp = keyRef.current;
    if (!kp) {
      setError('Bitte zuerst entschlüsseln.');
      return;
    }
    try {
      const res = await fetch(`/api/inbox/e2e-attachments/${id}`);
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? 'Anhang konnte nicht geladen werden.');
        return;
      }
      const payload = (await res.json()) as {
        mimeType: string;
        blob: { nonce: string; content: string };
        filename: { nonce: string; content: string };
        wrap: string;
      };
      const e2e = await import('@/lib/e2e');
      const out = await e2e.decryptAttachment(payload, payload.wrap, kp.publicKey, kp.privateKey);
      const { triggerDownload } = await import('@/lib/attachments-client');
      triggerDownload(out.bytes, out.filename, payload.mimeType);
    } catch {
      setError('Entschlüsselung des Anhangs fehlgeschlagen.');
    }
  }

  if (needsToken) {
    return (
      <form onSubmit={handleTokenSubmit} className="flex max-w-sm flex-col gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Zum Entschlüsseln im Browser bitte Ihren Zugangscode (erneut) eingeben.
        </p>
        <input
          type="text"
          name="token"
          autoComplete="off"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 font-mono dark:border-slate-700 dark:bg-slate-900"
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="self-start rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-accent disabled:opacity-60"
        >
          {busy ? 'Entschlüssele …' : 'Entschlüsseln'}
        </button>
      </form>
    );
  }

  if (!ready) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Entschlüssele im Browser …</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <article className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          Ihre Meldung · im Browser entschlüsselt
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
                <dt>Ihre Kontaktangabe:</dt>
                <dd className="break-all">{report.contact}</dd>
              </div>
            )}
          </dl>
        )}
      </article>

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
              <span className="font-medium">{fromOffice ? 'Meldestelle' : 'Sie'}</span>
              <span>{formatDateTime(m.createdAt)}</span>
            </div>
            <p className="whitespace-pre-wrap break-words">{messages[m.id] ?? '…'}</p>
          </article>
        );
      })}

      <section className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
        <h3 className="text-sm font-medium">Anhänge (Ende-zu-Ende-verschlüsselt)</h3>
        {data.attachments.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">Noch keine Anhänge.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {data.attachments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-500 dark:text-slate-400">
                  {a.mimeType} · {formatBytes(a.sizeBytes)} · {formatDateTime(a.createdAt)}
                </span>
                <button
                  type="button"
                  onClick={() => handleDownload(a.id)}
                  className="text-brand underline hover:text-brand-accent"
                >
                  Herunterladen
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="cursor-pointer self-start rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900">
          {busy ? 'Verarbeite …' : 'Datei verschlüsselt anhängen'}
          <input type="file" className="hidden" disabled={busy} onChange={handleUpload} />
        </label>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Bilder werden vor dem Hochladen von Metadaten (z. B. GPS) bereinigt. Max. 10 MB.
        </p>
      </section>

      <form
        ref={formRef}
        onSubmit={handleReply}
        className="mt-3 flex flex-col gap-3 border-t border-slate-200 pt-4 dark:border-slate-800"
      >
        <label htmlFor="body" className="text-sm font-medium">
          Neue Nachricht an die Meldestelle (Ende-zu-Ende-verschlüsselt)
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
          {busy ? 'Wird gesendet …' : 'Verschlüsselt senden'}
        </button>
      </form>
    </div>
  );
}
