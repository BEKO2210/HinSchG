// HinSchG — API: Stripe-Webhook (Phase 10b)
//
// Oeffentlich erreichbar, aber durch Signaturpruefung (STRIPE_WEBHOOK_SECRET)
// gegen den Roh-Body abgesichert. Aktualisiert Tarif/Abo-Status der Meldestelle
// anhand der Abo-Events. Verarbeitet bewusst nur die noetigen Felder; es werden
// keine Zahlungs-/Adressdaten gespeichert.
//
// SUSPENDED-Wirkung (siehe plans/cases): eine nicht (mehr) aktiv bezahlte
// Meldestelle nimmt keine neuen Meldungen mehr an; Bestandsfaelle bleiben fuer
// Bearbeiter:innen lesbar.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { planForStripePriceId } from '@/lib/plans';
import { verifyWebhookSignature } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Stripe-Abo-Status -> bleibt die Meldestelle aktiv? Nur "active"/"trialing"
// gelten als bezahlt; alles andere (past_due, unpaid, canceled, ...) -> SUSPENDED.
function isPaidStatus(status: string): boolean {
  return status === 'active' || status === 'trialing';
}

interface StripeSubscriptionEvent {
  type?: string;
  data?: {
    object?: {
      id?: string;
      status?: string;
      customer?: string;
      metadata?: { officeId?: string };
      items?: { data?: { price?: { id?: string } }[] };
    };
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // Billing nicht konfiguriert -> Endpunkt existiert, tut aber nichts.
    return NextResponse.json({ error: 'Billing nicht aktiviert.' }, { status: 503 });
  }

  // Roh-Body fuer die Signaturpruefung (NICHT request.json()).
  const payload = await request.text();
  const ok = verifyWebhookSignature({
    payload,
    signatureHeader: request.headers.get('stripe-signature'),
    secret,
  });
  if (!ok) {
    return NextResponse.json({ error: 'Ungültige Signatur.' }, { status: 400 });
  }

  let event: StripeSubscriptionEvent;
  try {
    event = JSON.parse(payload) as StripeSubscriptionEvent;
  } catch {
    return NextResponse.json({ error: 'Ungültiges JSON.' }, { status: 400 });
  }

  const type = event.type ?? '';
  const obj = event.data?.object ?? {};

  // Nur Abo-Lebenszyklus-Events sind relevant.
  if (
    type === 'customer.subscription.created' ||
    type === 'customer.subscription.updated' ||
    type === 'customer.subscription.deleted'
  ) {
    const officeId = obj.metadata?.officeId;
    const subscriptionId = obj.id;
    const customerId = typeof obj.customer === 'string' ? obj.customer : null;
    const status = obj.status ?? '';
    const priceId = obj.items?.data?.[0]?.price?.id ?? '';

    if (!officeId) {
      // Ohne Zuordnung koennen wir nichts tun; 200, damit Stripe nicht endlos retryt.
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const office = await prisma.reportingOffice.findUnique({
      where: { id: officeId },
      select: { id: true },
    });
    if (!office) {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const deleted = type === 'customer.subscription.deleted';
    const planStatus = !deleted && isPaidStatus(status) ? 'ACTIVE' : 'SUSPENDED';
    // Tarif aus dem Price ableiten; bei Kuendigung auf FREE zuruecksetzen.
    const mappedPlan = deleted ? 'FREE' : planForStripePriceId(priceId);

    await prisma.$transaction(async (tx) => {
      await tx.reportingOffice.update({
        where: { id: office.id },
        data: {
          planStatus,
          ...(customerId ? { stripeCustomerId: customerId } : {}),
          stripeSubscriptionId: deleted ? null : subscriptionId,
          ...(mappedPlan ? { plan: mappedPlan } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          actorType: 'SYSTEM',
          action: 'BILLING_SUBSCRIPTION_UPDATED',
          officeId: office.id,
          // Keine Zahlungsdaten: nur abgeleiteter Tarif/Status.
          metadata: { planStatus, ...(mappedPlan ? { plan: mappedPlan } : {}) },
        },
      });
    });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
