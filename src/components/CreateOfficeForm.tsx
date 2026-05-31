'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { HANDLER_PASSWORD_MIN } from '@/lib/handlers';

export function CreateOfficeForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setDone(null);
    setBusy(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      name: String(data.get('name') ?? ''),
      slug: String(data.get('slug') ?? ''),
      adminEmail: String(data.get('adminEmail') ?? ''),
      adminPassword: String(data.get('adminPassword') ?? ''),
    };
    try {
      const res = await fetch('/api/admin/offices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const b = (await res.json().catch(() => ({}))) as { slug?: string };
        setDone(`Meldestelle „${b.slug ?? ''}" angelegt.`);
        form.reset();
        router.refresh();
      } else {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? 'Anlegen fehlgeschlagen.');
      }
    } catch {
      setError('Netzwerkfehler.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        type="text"
        name="name"
        required
        placeholder="Name der Meldestelle (z. B. Kanzlei Müller)"
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
      />
      <input
        type="text"
        name="slug"
        pattern="[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?"
        placeholder="Slug (optional, z. B. kanzlei-mueller) — sonst aus dem Namen abgeleitet"
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
      />
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Die öffentliche Melde-URL lautet später <code>/m/&lt;slug&gt;/melden</code>.
      </p>
      <fieldset className="flex flex-col gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-700">
        <legend className="px-1 text-xs text-slate-500 dark:text-slate-400">
          Initial-Administrator:in (optional — kann auch später angelegt werden)
        </legend>
        <input
          type="email"
          name="adminEmail"
          placeholder="E-Mail der Administrator:in"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <input
          type="password"
          name="adminPassword"
          minLength={HANDLER_PASSWORD_MIN}
          placeholder="Initialpasswort"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
      </fieldset>
      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      {done && <p className="text-sm text-green-700 dark:text-green-400">{done}</p>}
      <button
        type="submit"
        disabled={busy}
        className="self-start rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-accent disabled:opacity-60"
      >
        {busy ? 'Wird angelegt …' : 'Meldestelle anlegen'}
      </button>
    </form>
  );
}
