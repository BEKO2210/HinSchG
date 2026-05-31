import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCheckoutSession, isStripeConfigured, verifyWebhookSignature } from './stripe';

const SECRET = 'whsec_test_secret';

function sign(payload: string, timestamp: number, secret = SECRET): string {
  const sig = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

describe('verifyWebhookSignature', () => {
  const payload = JSON.stringify({ type: 'customer.subscription.updated' });
  const now = 1_900_000_000;

  it('akzeptiert eine gültige, frische Signatur', () => {
    const header = sign(payload, now);
    expect(
      verifyWebhookSignature({ payload, signatureHeader: header, secret: SECRET, nowSeconds: now }),
    ).toBe(true);
  });

  it('nutzt Default-Toleranz und -Zeit, wenn nicht angegeben', () => {
    // Ohne nowSeconds/toleranceSeconds: Default now = Date.now(), Toleranz 300s.
    const header = sign(payload, Math.floor(Date.now() / 1000));
    expect(verifyWebhookSignature({ payload, signatureHeader: header, secret: SECRET })).toBe(true);
  });

  it('lehnt eine falsche Signatur ab', () => {
    const header = sign(payload, now, 'whsec_wrong');
    expect(
      verifyWebhookSignature({ payload, signatureHeader: header, secret: SECRET, nowSeconds: now }),
    ).toBe(false);
  });

  it('lehnt einen manipulierten Payload ab', () => {
    const header = sign(payload, now);
    expect(
      verifyWebhookSignature({
        payload: payload + 'x',
        signatureHeader: header,
        secret: SECRET,
        nowSeconds: now,
      }),
    ).toBe(false);
  });

  it('lehnt einen zu alten Zeitstempel ab (Replay-Schutz)', () => {
    const header = sign(payload, now - 10_000);
    expect(
      verifyWebhookSignature({ payload, signatureHeader: header, secret: SECRET, nowSeconds: now }),
    ).toBe(false);
  });

  it('lehnt fehlenden Header / fehlendes Secret ab', () => {
    expect(verifyWebhookSignature({ payload, signatureHeader: null, secret: SECRET })).toBe(false);
    expect(
      verifyWebhookSignature({ payload, signatureHeader: sign(payload, now), secret: '' }),
    ).toBe(false);
  });

  it('lehnt einen kaputten Header ab', () => {
    expect(
      verifyWebhookSignature({
        payload,
        signatureHeader: 'garbage',
        secret: SECRET,
        nowSeconds: now,
      }),
    ).toBe(false);
  });
});

describe('isStripeConfigured', () => {
  const orig = process.env.STRIPE_SECRET_KEY;
  afterEach(() => {
    if (orig === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = orig;
    vi.unstubAllGlobals();
  });

  it('ist false ohne Secret-Key, true mit', () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(isStripeConfigured()).toBe(false);
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    expect(isStripeConfigured()).toBe(true);
  });
});

describe('createCheckoutSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.STRIPE_SECRET_KEY;
  });

  it('wirft ohne konfigurierten Secret-Key', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    await expect(
      createCheckoutSession({
        priceId: 'price_1',
        officeId: 'o1',
        successUrl: 'https://x/ok',
        cancelUrl: 'https://x/no',
      }),
    ).rejects.toThrow();
  });

  it('sendet die korrekten Felder und gibt id+url zurück', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    let capturedBody = '';
    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      capturedBody = init.body;
      return {
        ok: true,
        json: async () => ({ id: 'cs_123', url: 'https://checkout.stripe/abc' }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await createCheckoutSession({
      priceId: 'price_pro',
      officeId: 'office_42',
      successUrl: 'https://app/ok',
      cancelUrl: 'https://app/no',
      customerId: 'cus_9',
    });
    expect(res).toEqual({ id: 'cs_123', url: 'https://checkout.stripe/abc' });
    expect(capturedBody).toContain('mode=subscription');
    expect(capturedBody).toContain('client_reference_id=office_42');
    expect(capturedBody).toContain('customer=cus_9');
    expect(capturedBody).toContain(encodeURIComponent('subscription_data[metadata][officeId]'));
  });

  it('wirft bei einer Stripe-Fehlerantwort', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: { message: 'Stripe sagt nein' } }),
      })),
    );
    await expect(
      createCheckoutSession({
        priceId: 'price_1',
        officeId: 'o1',
        successUrl: 'https://x/ok',
        cancelUrl: 'https://x/no',
      }),
    ).rejects.toThrow('Stripe sagt nein');
  });

  it('wirft mit Standardmeldung, wenn die Antwort keine Fehlermeldung enthält', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({}) })),
    );
    await expect(
      createCheckoutSession({
        priceId: 'price_1',
        officeId: 'o1',
        successUrl: 'https://x/ok',
        cancelUrl: 'https://x/no',
      }),
    ).rejects.toThrow('Stripe-Checkout');
  });
});
