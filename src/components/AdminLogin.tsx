'use client';

/* eslint-disable @next/next/no-img-element */
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Stage = 'password' | 'totp' | 'totp_setup';

interface SetupInfo {
  secret: string;
  otpauthUri: string;
  qrDataUrl: string;
}

const inputClass =
  'rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900';
const buttonClass =
  'rounded-md bg-brand px-4 py-2.5 font-medium text-white hover:bg-brand-accent disabled:cursor-not-allowed disabled:opacity-60';

export function AdminLogin() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('password');
  const [setup, setSetup] = useState<SetupInfo | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.get('email'), password: data.get('password') }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        stage?: Stage;
        error?: string;
      } & Partial<SetupInfo>;
      if (!response.ok) {
        setError(body.error ?? 'Anmeldung fehlgeschlagen.');
        return;
      }
      if (body.stage === 'totp_setup' && body.secret && body.otpauthUri && body.qrDataUrl) {
        setSetup({ secret: body.secret, otpauthUri: body.otpauthUri, qrDataUrl: body.qrDataUrl });
        setStage('totp_setup');
      } else {
        setStage('totp');
      }
    } catch {
      setError('Netzwerkfehler. Bitte erneut versuchen.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTotp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/admin/login/totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: data.get('code') }),
      });
      if (response.ok) {
        router.push('/admin');
        router.refresh();
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? 'Verifikation fehlgeschlagen.');
    } catch {
      setError('Netzwerkfehler. Bitte erneut versuchen.');
    } finally {
      setSubmitting(false);
    }
  }

  if (stage === 'password') {
    return (
      <form onSubmit={handlePassword} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            E-Mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="username"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            Passwort
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className={inputClass}
          />
        </div>
        {error && <ErrorBox message={error} />}
        <button type="submit" disabled={submitting} className={buttonClass}>
          {submitting ? 'Wird geprüft …' : 'Weiter'}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleTotp} className="flex flex-col gap-4">
      {stage === 'totp_setup' && setup && (
        <div className="flex flex-col gap-3 rounded-md border border-slate-200 p-4 dark:border-slate-800">
          <p className="text-sm font-medium">Zwei-Faktor-Authentifizierung einrichten</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Scannen Sie den QR-Code mit einer Authenticator-App und geben Sie anschließend den
            6-stelligen Code ein.
          </p>
          <img
            src={setup.qrDataUrl}
            alt="TOTP-QR-Code"
            width={220}
            height={220}
            className="self-center rounded bg-white p-2"
          />
          <p className="break-all text-xs text-slate-500 dark:text-slate-400">
            Manuell: <code className="select-all">{setup.secret}</code>
          </p>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="code" className="text-sm font-medium">
          6-stelliger Code
        </label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          placeholder="123456"
          className={`${inputClass} font-mono tracking-widest`}
        />
      </div>
      {error && <ErrorBox message={error} />}
      <button type="submit" disabled={submitting} className={buttonClass}>
        {submitting ? 'Wird geprüft …' : 'Anmelden'}
      </button>
    </form>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
    >
      {message}
    </p>
  );
}
