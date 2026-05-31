// HinSchG — Stripe-Anbindung (Phase 10b), bewusst ohne SDK-Abhaengigkeit.
//
// Datenschutz/Bedrohungsmodell:
//   - Wir speichern NUR undurchsichtige Stripe-Referenz-IDs (Customer/Subscription).
//     Karten-, Rechnungs- und Adressdaten liegen ausschliesslich bei Stripe.
//   - Der Hinweisgeber-Pfad beruehrt Stripe NIEMALS (kein Tracking, keine PII).
//   - Alles ist abschaltbar: ohne STRIPE_SECRET_KEY ist Billing inaktiv.
//
// Implementiert nur das Noetige: Checkout-Session anlegen (REST) +
// Webhook-Signaturpruefung (HMAC-SHA256, offizielles Stripe-Schema). Reine
// Node-Runtime (node:crypto), kein npm-Paket — robust fuer CI/Self-Hosting.

import { createHmac, timingSafeEqual } from 'node:crypto';

const STRIPE_API = 'https://api.stripe.com/v1';

/** Ist die Stripe-Anbindung konfiguriert (Secret-Key vorhanden)? */
export function isStripeConfigured(): boolean {
  return (
    typeof process.env.STRIPE_SECRET_KEY === 'string' && process.env.STRIPE_SECRET_KEY.length > 0
  );
}

function secretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY ist nicht gesetzt.');
  }
  return key;
}

/** Kodiert ein flaches Objekt als application/x-www-form-urlencoded (Stripe-Format). */
function formEncode(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

export interface CheckoutSessionResult {
  id: string;
  url: string;
}

/**
 * Legt eine Stripe-Checkout-Session (Abo) an und gibt die Weiterleitungs-URL
 * zurueck. Die Office-ID wird als client_reference_id mitgegeben, damit der
 * Webhook die Zahlung der richtigen Meldestelle zuordnen kann. Eine bestehende
 * Customer-ID wird wiederverwendet, sonst legt Stripe eine neue an.
 */
export async function createCheckoutSession(args: {
  priceId: string;
  officeId: string;
  successUrl: string;
  cancelUrl: string;
  customerId?: string | null;
}): Promise<CheckoutSessionResult> {
  const params: Record<string, string> = {
    mode: 'subscription',
    'line_items[0][price]': args.priceId,
    'line_items[0][quantity]': '1',
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    client_reference_id: args.officeId,
    // Idempotenz-/Zuordnungs-Metadatum auf der Subscription.
    'subscription_data[metadata][officeId]': args.officeId,
  };
  if (args.customerId) {
    params.customer = args.customerId;
  }

  const response = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formEncode(params),
  });
  const body = (await response.json().catch(() => ({}))) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };
  if (!response.ok || !body.id || !body.url) {
    throw new Error(body.error?.message ?? 'Stripe-Checkout konnte nicht erstellt werden.');
  }
  return { id: body.id, url: body.url };
}

/**
 * Verifiziert die Stripe-Webhook-Signatur (Header `Stripe-Signature`) gegen den
 * Roh-Body und das Signing-Secret. Folgt dem offiziellen Schema
 * (`t=<timestamp>,v1=<hmac>` ueber `"<t>.<payload>"`). Optionaler
 * Toleranzfenster-Check gegen Replay (Standard 5 Minuten).
 */
export function verifyWebhookSignature(args: {
  payload: string;
  signatureHeader: string | null;
  secret: string;
  toleranceSeconds?: number;
  nowSeconds?: number;
}): boolean {
  const { payload, signatureHeader, secret } = args;
  if (!signatureHeader || !secret) {
    return false;
  }
  const parts = signatureHeader.split(',').map((p) => p.trim());
  let timestamp = '';
  const v1: string[] = [];
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (key === 't') timestamp = value;
    else if (key === 'v1') v1.push(value);
  }
  if (!timestamp || v1.length === 0) {
    return false;
  }

  // Replay-Schutz: Zeitstempel innerhalb der Toleranz?
  const tolerance = args.toleranceSeconds ?? 300;
  const now = args.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > tolerance) {
    return false;
  }

  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  const expBuf = Buffer.from(expected, 'utf8');
  // Konstant-Zeit-Vergleich gegen alle gelieferten v1-Signaturen.
  return v1.some((sig) => {
    const sigBuf = Buffer.from(sig, 'utf8');
    return sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);
  });
}
