import Link from 'next/link';

/* eslint-disable-next-line @next/next/no-img-element */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <header className="flex flex-col items-center gap-5 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="HinSchG — Hinweisgeber- & Compliance-Plattform"
          width={440}
          height={145}
          className="h-auto w-[min(440px,85%)]"
        />
        <h1 className="sr-only">HinSchG — Hinweisgeber- &amp; Compliance-Plattform</h1>
        <p className="text-lg text-slate-600 dark:text-slate-300">
          Interne Meldestelle nach dem Hinweisgeberschutzgesetz (HinSchG) und der
          EU-Whistleblower-Richtlinie 2019/1937. Melden Sie Verstöße vertraulich — ohne Konto und
          ohne Pflicht zur Angabe Ihrer Identität.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/melden"
          className="flex flex-col gap-2 rounded-lg border border-slate-200 p-5 transition hover:border-brand hover:shadow-sm dark:border-slate-800"
        >
          <span className="text-lg font-medium">Meldung einreichen</span>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Einen Hinweis anonym übermitteln. Sie erhalten einen Zugangscode für Ihr Postfach.
          </span>
        </Link>

        <Link
          href="/postfach"
          className="flex flex-col gap-2 rounded-lg border border-slate-200 p-5 transition hover:border-brand hover:shadow-sm dark:border-slate-800"
        >
          <span className="text-lg font-medium">Postfach öffnen</span>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Mit Ihrem Zugangscode den Stand verfolgen und mit der Meldestelle kommunizieren.
          </span>
        </Link>
      </section>

      <section className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        <p className="font-medium">So schützen wir Sie</p>
        <ul className="list-inside list-disc space-y-1">
          <li>Keine Speicherung von IP-Adresse, Browser-Kennung oder Identität.</li>
          <li>Inhalte werden verschlüsselt gespeichert (Stufe 1: at rest, datenminimiert).</li>
          <li>Zugang ausschließlich über Ihren Zugangscode — keine Konten für Hinweisgeber.</li>
        </ul>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Hinweis: Dies ist noch keine Ende-zu-Ende-/Zero-Knowledge-Verschlüsselung.
        </p>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-6 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <Link href="/admin/login" className="hover:text-slate-700 dark:hover:text-slate-200">
          Zugang für Bearbeiter:innen
        </Link>
        <span>Open Source · AGPLv3</span>
      </footer>
    </main>
  );
}
