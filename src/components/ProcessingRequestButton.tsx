'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Status = 'NONE' | 'REQUESTED' | 'ACTIVE' | 'DECLINED';

// Phase 11a: Office-ADMIN fragt die Zusatzleistung "Fallbearbeitung durch
// Befugte" an. Setzt nur einen Workflow-Status, keine Zugriffsrechte.
export function ProcessingRequestButton({ status }: { status: Status }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'ACTIVE') {
    return (
      <span className="text-xs text-green-700 dark:text-green-400">
        Fallbearbeitung durch Befugte: aktiv
      </span>
    );
  }
  if (status === 'REQUESTED') {
    return (
      <span className="text-xs text-amber-700 dark:text-amber-400">
        Fallbearbeitung durch Befugte: angefragt
      </span>
    );
  }

  async function request() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/processing-request', { method: 'POST' });
      if (res.ok) {
        router.refresh();
      } else {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? 'Anfrage fehlgeschlagen.');
      }
    } catch {
      setError('Netzwerkfehler.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={request}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-900"
        title="Fallbearbeitung durch befugte Personen (z. B. Partner-Anwält:innen) anfragen"
      >
        Fallbearbeitung anfragen
      </button>
      {error && <span className="text-xs text-red-700 dark:text-red-400">{error}</span>}
    </span>
  );
}
