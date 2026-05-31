export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">HinSchG</h1>
      <p className="text-lg text-slate-600 dark:text-slate-300">
        Open-Source-Hinweisgeber- und Compliance-Plattform nach HinSchG / EU-Richtlinie 2019/1937.
      </p>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Grundgerüst. Sicherheitsstufe: verschlüsselt at rest und datenminimiert — noch nicht
        Zero-Knowledge.
      </p>
      <div className="flex flex-wrap gap-3">
        <a
          href="/melden"
          className="rounded-md bg-brand px-4 py-2.5 font-medium text-white hover:bg-brand-accent"
        >
          Meldung einreichen
        </a>
        <a
          href="/postfach"
          className="rounded-md border border-slate-300 px-4 py-2.5 font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
        >
          Postfach öffnen
        </a>
      </div>
    </main>
  );
}
