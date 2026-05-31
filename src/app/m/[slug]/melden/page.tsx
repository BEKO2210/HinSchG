import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ReportForm } from '@/components/ReportForm';
import { SiteHeader } from '@/components/SiteHeader';
import { prisma } from '@/lib/db';
import { isValidOfficeSlug } from '@/lib/office';
import { officeAcceptsReports } from '@/lib/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Meldung einreichen — HinSchG',
  description: 'Anonym einen Hinweis an die zuständige Meldestelle übermitteln.',
};

// Oeffentliche, mandantenspezifische Melde-Strecke (Multi-Tenant, Phase 9b).
// Der Slug adressiert genau eine Meldestelle; unbekannte Slugs -> 404.
export default async function TenantMeldenPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!isValidOfficeSlug((await params).slug)) {
    notFound();
  }
  const office = await prisma.reportingOffice.findUnique({
    where: { slug: (await params).slug },
    select: { name: true, slug: true, active: true, planStatus: true },
  });
  // Unbekannte, deaktivierte oder (bei aktivem Billing) gesperrte Meldestellen
  // sind öffentlich nicht erreichbar.
  if (!office || !officeAcceptsReports(office)) {
    notFound();
  }

  return (
    <main id="hauptinhalt" tabIndex={-1} className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-3">
        <SiteHeader />
        <Link
          href="/"
          className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          ← Startseite
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Meldung einreichen</h1>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Meldestelle: {office.name}
        </p>
        <p className="text-slate-600 dark:text-slate-300">
          Sie können einen Hinweis vollständig anonym übermitteln. Es werden keine IP-Adresse, kein
          Browser-Kennzeichen und keine Identitätsdaten gespeichert. Nach dem Absenden erhalten Sie
          einen Zugangscode, mit dem Sie den Stand verfolgen können.
        </p>
      </header>

      <ReportForm officeSlug={office.slug} />

      <footer className="border-t border-slate-200 pt-6 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        Ihr Hinweis wird verschlüsselt gespeichert und datenminimiert verarbeitet. Den Stand
        verfolgen Sie jederzeit anonym über Ihr{' '}
        <Link href="/postfach" className="underline">
          Postfach
        </Link>
        .
      </footer>
    </main>
  );
}
