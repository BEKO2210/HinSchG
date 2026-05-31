import type { Metadata } from 'next';
import Link from 'next/link';
import { CreateOfficeForm } from '@/components/CreateOfficeForm';
import { OfficeRowActions } from '@/components/OfficeRowActions';
import { requireAdminSession } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import { isBillingEnabled, planLabel } from '@/lib/plans';
import { isStripeConfigured } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Meldestellen — HinSchG',
};

// Plattform-Superadmin (Phase 9c): Verwaltung der Meldestellen. Es werden nur
// Metadaten + Zähler angezeigt — KEINE Fall-Inhalte (der Superadmin ist Teil des
// Bedrohungsmodells und erhält bewusst keinen Inhaltszugriff).
export default async function OfficesPage() {
  requireAdminSession(['SUPERADMIN']);

  const offices = await prisma.reportingOffice.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      active: true,
      plan: true,
      planStatus: true,
      managedProcessing: true,
      processingRequest: true,
      _count: { select: { handlers: true, cases: true } },
    },
  });
  const billingOn = isBillingEnabled();
  const stripeOn = isStripeConfigured();

  return (
    <main id="hauptinhalt" tabIndex={-1} className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <Link
          href="/admin"
          className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          ← Übersicht
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Meldestellen</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Plattform-Verwaltung. Sie sehen ausschließlich Metadaten der Meldestellen — keine
          Fallinhalte.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Vorhandene Meldestellen</h2>
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {offices.length === 0 ? (
            <li className="p-3 text-sm text-slate-500 dark:text-slate-400">
              Noch keine Meldestellen angelegt.
            </li>
          ) : (
            offices.map((office) => (
              <li key={office.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span className="flex flex-col">
                  <span className="font-medium">
                    {office.name}{' '}
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400">/m/{office.slug}</span>
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {office._count.handlers} Bearbeiter:innen · {office._count.cases} Fälle ·{' '}
                    <span
                      className={
                        office.active
                          ? 'text-green-700 dark:text-green-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }
                    >
                      {office.active ? 'aktiv' : 'deaktiviert'}
                    </span>
                    {billingOn && (
                      <>
                        {' · '}
                        Tarif {planLabel(office.plan)}
                        {office.planStatus === 'SUSPENDED' && (
                          <span className="text-amber-700 dark:text-amber-400"> (gesperrt)</span>
                        )}
                      </>
                    )}
                  </span>
                </span>
                <OfficeRowActions
                  officeId={office.id}
                  name={office.name}
                  active={office.active}
                  plan={office.plan}
                  managedProcessing={office.managedProcessing}
                  processingRequest={office.processingRequest}
                  billingEnabled={billingOn}
                  stripeConfigured={stripeOn}
                />
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="flex flex-col gap-3 border-t border-slate-200 pt-6 dark:border-slate-800">
        <h2 className="text-lg font-semibold">Neue Meldestelle anlegen</h2>
        <CreateOfficeForm />
      </section>
    </main>
  );
}
