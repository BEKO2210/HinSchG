'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PLANS, type Plan, planLabel } from '@/lib/plans';

export function OfficeRowActions({
  officeId,
  name,
  active,
  plan,
  billingEnabled,
}: {
  officeId: string;
  name: string;
  active: boolean;
  plan: Plan;
  billingEnabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/offices/${officeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setRenaming(false);
        router.refresh();
      } else {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? 'Änderung fehlgeschlagen.');
      }
    } catch {
      setError('Netzwerkfehler.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get('name') ?? '').trim();
    if (value) await patch({ name: value });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-3 text-xs">
        <button
          type="button"
          onClick={() => setRenaming((v) => !v)}
          className="text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          Umbenennen
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => patch({ active: !active })}
          className={
            active
              ? 'text-amber-600 underline hover:text-amber-700 dark:text-amber-400'
              : 'text-green-600 underline hover:text-green-700 dark:text-green-400'
          }
        >
          {active ? 'Deaktivieren' : 'Aktivieren'}
        </button>
        {billingEnabled && (
          <label className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
            Tarif
            <select
              defaultValue={plan}
              disabled={busy}
              onChange={(e) => patch({ plan: e.target.value })}
              className="rounded-md border border-slate-300 bg-white px-1 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            >
              {PLANS.map((p) => (
                <option key={p} value={p}>
                  {planLabel(p)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {renaming && (
        <form onSubmit={handleRename} className="mt-1 flex items-center gap-2">
          <input
            type="text"
            name="name"
            defaultValue={name}
            required
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-accent disabled:opacity-60"
          >
            Speichern
          </button>
        </form>
      )}
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
