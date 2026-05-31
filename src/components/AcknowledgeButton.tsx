'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function AcknowledgeButton({
  caseId,
  acknowledged,
}: {
  caseId: string;
  acknowledged: boolean;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (acknowledged) {
    return (
      <span className="rounded-md bg-green-100 px-3 py-1.5 text-sm font-medium text-green-700 dark:bg-green-950/40 dark:text-green-300">
        Eingang bestätigt
      </span>
    );
  }

  async function handleClick() {
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/admin/cases/${caseId}/acknowledge`, { method: 'POST' });
      if (response.ok) {
        router.refresh();
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? 'Bestätigung fehlgeschlagen.');
    } catch {
      setError('Netzwerkfehler.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={submitting}
        className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-accent disabled:opacity-60"
      >
        {submitting ? 'Wird bestätigt …' : 'Eingang bestätigen'}
      </button>
      {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}
