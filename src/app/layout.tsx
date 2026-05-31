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
        {children}
      </body>
    </html>
  );
}
