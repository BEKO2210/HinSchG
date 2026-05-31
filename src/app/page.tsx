export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">HinSchG</h1>
      <p className="text-lg text-slate-600 dark:text-slate-300">
        Open-Source-Hinweisgeber- und Compliance-Plattform nach HinSchG / EU-Richtlinie 2019/1937.
      </p>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Grundgeruest (Phase 0). Meldestrecke, Postfach und Bearbeiter-Dashboard folgen in den
        naechsten Phasen. Sicherheitsstufe: verschluesselt at rest und datenminimiert — noch nicht
        Zero-Knowledge.
      </p>
    </main>
  );
}
