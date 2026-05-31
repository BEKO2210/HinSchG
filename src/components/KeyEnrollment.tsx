'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { encryptPrivateKey, generateKeyPair } from '@/lib/e2e';

export function KeyEnrollment() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password') ?? '');
    if (!password) {
      setError('Bitte Ihr Passwort eingeben.');
      return;
    }

    setSubmitting(true);
    try {
      // Schlüsselpaar im Browser erzeugen; privaten Key mit dem Passwort
      // verschlüsseln — er verlässt den Browser nur verschlüsselt.
      const kp = await generateKeyPair();
      const enc = await encryptPrivateKey(kp.privateKey, password);
      const response = await fetch('/api/admin/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          publicKey: kp.publicKey,
          encryptedPrivateKey: JSON.stringify(enc),
        }),
      });
      if (response.ok) {
        router.refresh();
        return;
      }
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? 'Einrichtung fehlgeschlagen.');
    } catch {
      setError('Die Schlüsselerzeugung ist fehlgeschlagen.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Ihr persönliches Schlüsselpaar wird im Browser erzeugt. Der private Schlüssel wird mit Ihrem
        Passwort verschlüsselt und nur so gespeichert — der Server sieht ihn nie im Klartext. Mit
        diesem Schlüssel können Sie künftig Ende-zu-Ende-verschlüsselte Fälle entschlüsseln.
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Passwort (zur Bestätigung)
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        />
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
        className="self-start rounded-md bg-brand px-4 py-2.5 font-medium text-white hover:bg-brand-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Wird eingerichtet …' : 'Schlüsselpaar einrichten'}
      </button>
    </form>
  );
}
