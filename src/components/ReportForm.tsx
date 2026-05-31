'use client';

import { useState } from 'react';
import { REPORT_CATEGORIES } from '@/lib/cases';

interface SubmitResult {
  receiptToken: string;
  deadlineAck: string;
  deadlineFeedback: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function ReportForm() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      category: String(data.get('category') ?? ''),
      description: String(data.get('description') ?? ''),
      incidentDate: String(data.get('incidentDate') ?? ''),
      contact: String(data.get('contact') ?? ''),
    };

    try {
      const response = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as Partial<SubmitResult> & {
        error?: string;
      };
      if (!response.ok || !body.receiptToken) {
        setError(body.error ?? 'Die Meldung konnte nicht übermittelt werden.');
        return;
      }
      setResult({
        receiptToken: body.receiptToken,
        deadlineAck: body.deadlineAck ?? '',
        deadlineFeedback: body.deadlineFeedback ?? '',
      });
    } catch {
      setError('Netzwerkfehler. Bitte erneut versuchen.');
    } finally {
      setSubmitting(false);
    }
  }

  async function copyToken() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.receiptToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  if (result) {
    return (
      <section className="flex flex-col gap-5" aria-live="polite">
        <h2 className="text-xl font-semibold">Ihre Meldung wurde übermittelt</h2>

        <div className="rounded-md border border-amber-400 bg-amber-50 p-4 text-amber-900 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-medium">
            Bewahren Sie diesen Code sicher auf — er ist der einzige Zugang zu Ihrem Postfach und
            kann nicht wiederhergestellt werden.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <span className="text-sm text-slate-500 dark:text-slate-400">Ihr Zugangscode:</span>
          <div className="flex flex-col items-center gap-3 rounded-md border border-slate-300 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-900">
            <code className="select-all break-all text-center font-mono text-lg font-semibold tracking-wider sm:text-2xl">
              {result.receiptToken}
            </code>
            <button
              type="button"
              onClick={copyToken}
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-accent"
            >
              {copied ? 'Kopiert ✓' : 'Code kopieren'}
            </button>
          </div>
        </div>

        {result.deadlineAck && result.deadlineFeedback && (
          <ul className="list-inside list-disc text-sm text-slate-600 dark:text-slate-300">
            <li>Eingangsbestätigung spätestens bis {formatDate(result.deadlineAck)}.</li>
            <li>
              Rückmeldung zu Folgemaßnahmen spätestens bis {formatDate(result.deadlineFeedback)}.
            </li>
          </ul>
        )}

        <p className="text-sm text-slate-600 dark:text-slate-300">
          Mit diesem Code können Sie Ihr anonymes Postfach unter <code>/postfach</code> öffnen, den
          Stand verfolgen und mit der Meldestelle kommunizieren.
        </p>
      </section>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="category" className="text-sm font-medium">
          Kategorie <span className="text-slate-400">(optional)</span>
        </label>
        <select
          id="category"
          name="category"
          defaultValue=""
          className="rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">Bitte wählen …</option>
          {REPORT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium">
          Beschreibung des Sachverhalts <span className="text-red-600">*</span>
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={8}
          maxLength={20000}
          placeholder="Schildern Sie den Vorfall so konkret wie möglich. Bitte geben Sie nur Informationen an, die Sie teilen möchten."
          className="rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="incidentDate" className="text-sm font-medium">
          Zeitpunkt des Vorfalls <span className="text-slate-400">(optional)</span>
        </label>
        <input
          id="incidentDate"
          name="incidentDate"
          type="date"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="contact" className="text-sm font-medium">
          Freiwillige Kontaktmöglichkeit <span className="text-slate-400">(optional)</span>
        </label>
        <input
          id="contact"
          name="contact"
          type="text"
          maxLength={1000}
          placeholder="z. B. eine anonyme E-Mail-Adresse — nur wenn Sie möchten"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Eine Identitätsangabe ist niemals erforderlich. Der Zugang zu Ihrem Postfach erfolgt
          ausschließlich über den Zugangscode.
        </p>
      </div>

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
        className="rounded-md bg-brand px-4 py-2.5 font-medium text-white hover:bg-brand-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Wird übermittelt …' : 'Meldung absenden'}
      </button>
    </form>
  );
}
