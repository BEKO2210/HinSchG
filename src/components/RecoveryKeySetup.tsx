'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { encryptPrivateKey, generateKeyPair } from '@/lib/e2e';

const MIN_PASSPHRASE = 12;

export function RecoveryKeySetup() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const pass = String(data.get('passphrase') ?? '');
    const confirm = String(data.get('confirm') ?? '');
    if (pass.length < MIN_PASSPHRASE) {
      setError(`Die Passphrase muss mindestens ${MIN_PASSPHRASE} Zeichen lang sein.`);
      return;
    }
    if (pass !== confirm) {
      setError('Die Passphrasen stimmen nicht überein.');
      return;
    }

    setSubmitting(true);
    try {
      // Schlüsselpaar wird ausschließlich im Browser erzeugt; der private Key
      // verlässt den Browser nur passphrasenverschlüsselt.
      const kp = await generateKeyPair();
      const enc = await encryptPrivateKey(kp.privateKey, pass);
      const response = await fetch('/api/admin/e2e/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recoveryPublicKey: kp.publicKey,
          encryptedRecoveryPrivateKey: JSON.stringify(enc),
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
      <div className="rounded-md border border-amber-400 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-100">
        Wählen Sie eine starke Recovery-Passphrase und bewahren Sie sie{' '}
        <strong>getrennt und sicher</strong> auf (z. B. im Tresor/Passwort-Manager mehrerer
        Verantwortlicher). Ohne diese Passphrase können verschlüsselte Fälle im Notfall nicht
        wiederhergestellt werden — sie ist nicht zurücksetzbar.
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="passphrase" className="text-sm font-medium">
          Recovery-Passphrase
        </label>
        <input
          id="passphrase"
          name="passphrase"
          type="password"
          required
          minLength={MIN_PASSPHRASE}
          autoComplete="new-password"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm" className="text-sm font-medium">
          Passphrase wiederholen
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={MIN_PASSPHRASE}
          autoComplete="new-password"
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
        {submitting ? 'Wird eingerichtet …' : 'Recovery-Schlüssel erzeugen'}
      </button>
    </form>
  );
}
