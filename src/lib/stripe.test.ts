import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyWebhookSignature } from './stripe';

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
