'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

export function OfficeReplyForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/admin/cases/${caseId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: data.get('body') }),
      });
      if (response.ok) {
        formRef.current?.reset();
        router.refresh();
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? 'Die Nachricht konnte nicht gesendet werden.');
    } catch {
      setError('Netzwerkfehler. Bitte erneut versuchen.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label htmlFor="office-body" className="text-sm font-medium">
        Antwort an den Hinweisgeber
      </label>
      <textarea
        id="office-body"
        name="body"
        required
        rows={4}
        maxLength={20000}
        placeholder="Ihre Nachricht an den Hinweisgeber …"
        className="rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
      />
      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Wird gesendet …' : 'Antwort senden'}
      </button>
    </form>
  );
}
