'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CASE_STATUSES, SEVERITIES, caseStatusLabel, severityLabel } from '@/lib/case-status';

const selectClass =
  'rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 disabled:opacity-60';

export function CaseStatusControls({
  caseId,
  status,
  severity,
}: {
  caseId: string;
  status: string;
  severity: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(endpoint: 'status' | 'severity', payload: Record<string, string>) {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/cases/${caseId}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        router.refresh();
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? 'Speichern fehlgeschlagen.');
    } catch {
      setError('Netzwerkfehler.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-500 dark:text-slate-400">Status</span>
          <select
            defaultValue={status}
            disabled={busy}
            onChange={(e) => save('status', { status: e.target.value })}
            className={selectClass}
          >
            {CASE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {caseStatusLabel(value)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-500 dark:text-slate-400">Schweregrad</span>
          <select
            defaultValue={severity}
            disabled={busy}
            onChange={(e) => save('severity', { severity: e.target.value })}
            className={selectClass}
          >
            {SEVERITIES.map((value) => (
              <option key={value} value={value}>
                {severityLabel(value)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
