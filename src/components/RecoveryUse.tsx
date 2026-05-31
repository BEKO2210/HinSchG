'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface RecoveryData {
  recoveryPublicKey: string;
  encryptedRecoveryPrivateKey: string;
  caseRecoveryWrap: string | null;
  messages: { id: string; recoveryWrap: string | null }[];
  handlers: { id: string; publicKey: string }[];
}

export function RecoveryUse({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setDone(null);
    setBusy(true);
    const passphrase = String(new FormData(event.currentTarget).get('passphrase') ?? '');
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/recovery`);
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? 'Recovery-Daten nicht verfügbar.');
        return;
      }
      const data = (await res.json()) as RecoveryData;

      const e2e = await import('@/lib/e2e');
      let recoveryPriv: string;
      try {
        recoveryPriv = await e2e.decryptPrivateKey(
          JSON.parse(data.encryptedRecoveryPrivateKey),
          passphrase,
        );
      } catch {
        setError('Recovery-Passphrase falsch.');
        return;
      }

      // Inhaltsschlüssel mit dem Recovery-Schlüssel entpacken und für alle
      // Bearbeiter:innen neu verpacken (rein im Browser).
      const caseWraps: Record<string, string> = {};
      if (data.caseRecoveryWrap) {
        const contentKey = await e2e.sealOpen(
          data.caseRecoveryWrap,
          data.recoveryPublicKey,
          recoveryPriv,
        );
        for (const h of data.handlers) {
          caseWraps[h.id] = await e2e.sealTo(contentKey, h.publicKey);
        }
      }

      const messageWraps: Record<string, Record<string, string>> = {};
      for (const m of data.messages) {
        if (!m.recoveryWrap) continue;
        const mk = await e2e.sealOpen(m.recoveryWrap, data.recoveryPublicKey, recoveryPriv);
        const perHandler: Record<string, string> = {};
        for (const h of data.handlers) {
          perHandler[h.id] = await e2e.sealTo(mk, h.publicKey);
        }
        messageWraps[m.id] = perHandler;
      }

      const post = await fetch(`/api/admin/cases/${caseId}/recovery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseWraps, messageWraps }),
      });
      if (!post.ok) {
        const b = (await post.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? 'Wiederherstellung fehlgeschlagen.');
        return;
      }
      const result = (await post.json()) as { regranted: number };
      setDone(`Zugriff für ${data.handlers.length} Bearbeiter:in(nen) wiederhergestellt.`);
      void result;
      router.refresh();
    } catch {
      setError('Fehler bei der Wiederherstellung.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-md border border-slate-200 p-4 text-sm dark:border-slate-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="font-medium text-slate-700 hover:underline dark:text-slate-200"
      >
        Zugriff per Recovery-Schlüssel wiederherstellen {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-slate-600 dark:text-slate-300">
            Verpackt den Inhaltsschlüssel dieses Falls mit der Org-Recovery-Passphrase im Browser
            neu — z. B. für neu hinzugefügte Bearbeiter:innen oder nach Schlüsselverlust. Der Server
            sieht dabei keinen Klartext.
          </p>
          <form onSubmit={handleSubmit} className="flex max-w-sm flex-col gap-3">
            <input
              type="password"
              name="passphrase"
              required
              autoComplete="off"
              placeholder="Recovery-Passphrase"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
            />
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            {done && <p className="text-sm text-green-700 dark:text-green-400">{done}</p>}
            <button
              type="submit"
              disabled={busy}
              className="self-start rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-accent disabled:opacity-60"
            >
              {busy ? 'Stelle wieder her …' : 'Zugriff wiederherstellen'}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
