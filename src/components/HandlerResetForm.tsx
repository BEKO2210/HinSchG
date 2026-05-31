'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { HANDLER_PASSWORD_MIN } from '@/lib/handlers';

export function HandlerResetForm({ handlerId, email }: { handlerId: string; email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const password = String(new FormData(event.currentTarget).get('password') ?? '');
    try {
      const response = await fetch(`/api/admin/handlers/${handlerId}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        setDone(true);
        setOpen(false);
        router.refresh();
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? 'Zurücksetzen fehlgeschlagen.');
    } catch {
      setError('Netzwerkfehler.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {done && <span className="text-xs text-green-600 dark:text-green-400">zurückgesetzt</span>}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        Zurücksetzen
      </button>
      {open && (
        <form
          onSubmit={handleSubmit}
          className="mt-1 flex w-full max-w-xs flex-col gap-2 rounded-md border border-slate-200 p-3 dark:border-slate-700"
        >
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Neues Initialpasswort für {email}. Das E2E-Schlüsselpaar wird verworfen; die Person
            richtet beim nächsten Login ein neues ein. Zugriff auf bestehende E2E-Fälle danach per
            Recovery wiederherstellen.
          </p>
          <input
            type="text"
            name="password"
            required
            minLength={HANDLER_PASSWORD_MIN}
            placeholder="Neues Passwort"
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="self-start rounded-md bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-accent disabled:opacity-60"
          >
            {busy ? 'Setze zurück …' : 'Passwort & Schlüssel zurücksetzen'}
          </button>
        </form>
      )}
    </div>
  );
}
