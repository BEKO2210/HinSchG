'use client';

import { useState } from 'react';

export function InboxLogin() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const data = new FormData(event.currentTarget);
    const token = String(data.get('token') ?? '');

    async function authenticate(payload: Record<string, string>) {
      return fetch('/api/inbox/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    try {
      // Stufe 2 zuerst: Lookup-Hash im Browser berechnen, Token NICHT senden.
      const { tokenLookupHash, WB_TOKEN_STORAGE_KEY } = await import('@/lib/e2e');
      const tokenLookup = await tokenLookupHash(token);
      let response = await authenticate({ tokenLookup });
      let isE2e = response.ok;
      // Nicht gefunden? Dann Stufe-1-Fall (Token serverseitig prüfen lassen).
      if (response.status === 401) {
        isE2e = false;
        response = await authenticate({ token });
      }

      if (response.ok) {
        // Stufe 2: Token im Tab behalten, damit das Postfach im Browser
        // entschlüsseln kann (httpOnly-Session reicht dafür nicht).
        if (isE2e) {
          try {
            sessionStorage.setItem(WB_TOKEN_STORAGE_KEY, token);
          } catch {
            // sessionStorage nicht verfügbar — Postfach fragt den Code erneut ab.
          }
        }
        // Session-Cookie ist gesetzt; harte Neuladung, damit die Server-Ansicht
        // die neue Session zuverlässig übernimmt.
        window.location.assign('/postfach');
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (response.status === 429) {
        const retry = response.headers.get('Retry-After');
        setError(
          body.error ??
            `Zu viele Versuche. Bitte ${retry ? `${retry} Sekunden ` : ''}warten und erneut versuchen.`,
        );
      } else {
        setError(body.error ?? 'Anmeldung fehlgeschlagen.');
      }
    } catch {
      setError('Netzwerkfehler. Bitte erneut versuchen.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="token" className="text-sm font-medium">
          Zugangscode
        </label>
        <input
          id="token"
          name="token"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 font-mono tracking-wider dark:border-slate-700 dark:bg-slate-900"
        />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Den Code haben Sie beim Absenden Ihrer Meldung erhalten. Groß-/Kleinschreibung und
          Bindestriche sind egal.
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
        {submitting ? 'Wird geprüft …' : 'Postfach öffnen'}
      </button>
    </form>
  );
}
