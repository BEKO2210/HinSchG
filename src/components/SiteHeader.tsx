/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';

/** Schlanke Markenzeile (Bildmarke + Wortmarke), verlinkt zur Startseite. */
export function SiteHeader() {
  return (
    <Link href="/" className="inline-flex items-center gap-2" aria-label="HinSchG — Startseite">
      <img src="/logo-mark.png" alt="" width={32} height={33} className="h-8 w-auto" />
      <span className="text-lg font-semibold tracking-tight">HinSchG</span>
    </Link>
  );
}
