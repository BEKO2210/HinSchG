import type { Metadata } from 'next';
import './globals.css';

// Dynamisches Rendering erzwingen, damit die nonce-basierte CSP (siehe
// middleware.ts) auf jede Seite angewendet werden kann.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'HinSchG — Hinweisgeberschutz',
  description:
    'Open-Source-Hinweisgeber- und Compliance-Plattform nach HinSchG / EU-Richtlinie 2019/1937.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-white text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        {/* Sprungmarke (WCAG 2.4.1 / BITV): erlaubt Tastatur- und Screenreader-
            Nutzer:innen, wiederkehrende Navigation zu überspringen. Sichtbar nur
            bei Fokus; zielt auf das <main id="hauptinhalt"> jeder Seite. */}
        <a
          href="#hauptinhalt"
          className="sr-only rounded-md bg-brand px-4 py-2 text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
        >
          Zum Inhalt springen
        </a>
        {children}
      </body>
    </html>
  );
}
