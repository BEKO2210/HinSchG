'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { HANDLER_PASSWORD_MIN, HANDLER_ROLES } from '@/lib/handlers';

export function CreateHandlerForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/admin/handlers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.get('email'),
          password: data.get('password'),
          role: data.get('role'),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? 'Anlegen fehlgeschlagen.');
        return;
      }
      setSuccess('Bearbeiter angelegt. Die 2FA wird beim ersten Login eingerichtet.');
      formRef.current?.reset();
      router.refresh();
    } catch {
      setError('Netzwerkfehler. Bitte erneut versuchen.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-email" className="text-sm font-medium">
          E-Mail
        </label>
        <input
          id="new-email"
          name="email"
          type="email"
          required
          className="rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-password" className="text-sm font-medium">
          Initiales Passwort
        </label>
        <input
          id="new-password"
          name="password"
          type="text"
          required
          minLength={HANDLER_PASSWORD_MIN}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Mindestens {HANDLER_PASSWORD_MIN} Zeichen. Sicher uebergeben; beim ersten Login folgt die
          2FA-Einrichtung.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-role" className="text-sm font-medium">
          Rolle
        </label>
        <select
          id="new-role"
          name="role"
          defaultValue="HANDLER"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        >
          {HANDLER_ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300">
          {success}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Wird angelegt …' : 'Bearbeiter anlegen'}
      </button>
    </form>
  );
}
