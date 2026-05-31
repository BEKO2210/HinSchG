import type { Metadata } from 'next';
import Link from 'next/link';
import { ReportForm } from '@/components/ReportForm';

export const metadata: Metadata = {
  title: 'Meldung einreichen — HinSchG',
  description: 'Anonym einen Hinweis an die interne Meldestelle uebermitteln.',
};

export default function MeldenPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-3">
        <Link
          href="/"
          className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          ← Startseite
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Meldung einreichen</h1>
        <p className="text-slate-600 dark:text-slate-300">
          Sie koennen einen Hinweis vollstaendig anonym uebermitteln. Es werden keine IP-Adresse,
          kein Browser-Kennzeichen und keine Identitaetsdaten gespeichert. Nach dem Absenden
          erhalten Sie einen Zugangscode, mit dem Sie den Stand verfolgen koennen.
        </p>
      </header>

      <ReportForm />

      <footer className="border-t border-slate-200 pt-6 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        Sicherheitsstufe 1: Inhalte werden verschluesselt gespeichert (at rest) und datenminimiert.
        Dies ist noch keine Ende-zu-Ende-Verschluesselung.
      </footer>
    </main>
  );
}
