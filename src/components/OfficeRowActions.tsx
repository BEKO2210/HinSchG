'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PLANS, type Plan, planLabel } from '@/lib/plans';

export function OfficeRowActions({
  officeId,
  name,
  active,
  plan,
  managedProcessing,
  processingRequest,
  billingEnabled,
  stripeConfigured,
}: {
  officeId: string;
  name: string;
  active: boolean;
  plan: Plan;
  managedProcessing: boolean;
  processingRequest: 'NONE' | 'REQUESTED' | 'ACTIVE' | 'DECLINED';
  billingEnabled: boolean;
  stripeConfigured: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

  // Startet Stripe-Checkout fuer einen kostenpflichtigen Tarif und leitet weiter.
  async function startCheckout(targetPlan: Plan) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/offices/${officeId}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: targetPlan }),
      });
      const b = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && b.url) {
        window.location.assign(b.url);
        return;
      }
      setError(b.error ?? 'Checkout konnte nicht gestartet werden.');
    } catch {
      setError('Netzwerkfehler.');
    } finally {
      setBusy(false);
    }
  }

  // Phase 11a: Bearbeitungs-Anfrage freischalten/ablehnen (SUPERADMIN).
  async function decideProcessing(decision: 'approve' | 'decline') {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/offices/${officeId}/processing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? 'Entscheidung fehlgeschlagen.');
      }
    } catch {
      setError('Netzwerkfehler.');
    } finally {
      setBusy(false);
    }
  }

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
      {processingRequest === 'REQUESTED' && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-amber-600 dark:text-amber-400">Bearbeitung angefragt</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => decideProcessing('approve')}
            className="text-green-600 underline hover:text-green-700 dark:text-green-400"
          >
            Freischalten
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decideProcessing('decline')}
            className="text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Ablehnen
          </button>
        </div>
      )}
      {managedProcessing && processingRequest === 'ACTIVE' && (
        <span className="text-xs text-green-600 dark:text-green-400">Bearbeitung aktiv</span>
      )}
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
          <>
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
            <button
              type="button"
              disabled={busy}
              onClick={() => patch({ managedProcessing: !managedProcessing })}
              className={
                managedProcessing
                  ? 'text-brand underline hover:text-brand-accent'
                  : 'text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }
              title="Fallbearbeitung durch befugte Personen (z. B. Anwält:innen) — Aufpreis-Leistung"
            >
              {managedProcessing ? 'Bearbeitung: an' : 'Bearbeitung: aus'}
            </button>
            {stripeConfigured && (
              <button
                type="button"
                disabled={busy}
                onClick={() => startCheckout(plan === 'FREE' ? 'PRO' : plan)}
                className="text-green-600 underline hover:text-green-700 dark:text-green-400"
              >
                Abo per Stripe
              </button>
            )}
          </>
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
