// HinSchG — API: Stripe-Checkout fuer eine Meldestelle starten (nur SUPERADMIN)
//
// Phase 10b: Legt eine Stripe-Checkout-Session (Abo) fuer den gewuenschten Tarif
// an und liefert die Weiterleitungs-URL. Es werden KEINE Zahlungsdaten in der
// App verarbeitet — die Eingabe erfolgt vollstaendig bei Stripe. Der tatsaechliche
// Tarifwechsel passiert erst nach Bestaetigung per Webhook.

import { NextResponse } from 'next/server';
import { adminApiGuard } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import { isBillingEnabled, isPlan, stripePriceIdFor } from '@/lib/plans';
import { createCheckoutSession, isStripeConfigured } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await adminApiGuard(['SUPERADMIN']);
  if ('error' in guard) {
    return guard.error;
  }
  if (!isBillingEnabled() || !isStripeConfigured()) {
    return NextResponse.json({ error: 'Billing ist nicht aktiviert.' }, { status: 503 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiges JSON.' }, { status: 400 });
  }
  const plan = (raw as Record<string, unknown>)?.plan;
  if (!isPlan(plan) || plan === 'FREE') {
    return NextResponse.json({ error: 'Kein kostenpflichtiger Tarif gewählt.' }, { status: 400 });
  }
  const priceId = stripePriceIdFor(plan);
  if (!priceId) {
    return NextResponse.json(
      { error: 'Für diesen Tarif ist kein Stripe-Preis konfiguriert.' },
      { status: 503 },
    );
  }

  const office = await prisma.reportingOffice.findUnique({
    where: { id: (await params).id },
    select: { id: true, stripeCustomerId: true },
  });
  if (!office) {
    return NextResponse.json({ error: 'Meldestelle nicht gefunden.' }, { status: 404 });
  }

  const base = process.env.APP_BASE_URL || new URL(request.url).origin;
  let session: { id: string; url: string };
  try {
    session = await createCheckoutSession({
      priceId,
      officeId: office.id,
      customerId: office.stripeCustomerId,
      successUrl: `${base}/admin/offices?billing=success`,
      cancelUrl: `${base}/admin/offices?billing=cancel`,
    });
  } catch {
    // Keine Anbieter-Details nach aussen geben.
    return NextResponse.json({ error: 'Checkout konnte nicht gestartet werden.' }, { status: 502 });
  }

  await prisma.auditLog.create({
    data: {
      actorType: 'HANDLER',
      actorId: guard.session.h,
      action: 'BILLING_CHECKOUT_STARTED',
      officeId: office.id,
      metadata: { plan },
    },
  });

  return NextResponse.json({ url: session.url }, { status: 200 });
}
