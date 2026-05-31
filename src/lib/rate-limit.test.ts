import { beforeEach, describe, expect, it } from 'vitest';
import { clientKeyFromHeaders, rateLimit, resetRateLimitState } from './rate-limit';

beforeEach(() => {
  resetRateLimitState();
});

describe('rateLimit', () => {
  it('erlaubt bis zum Limit und blockt danach', () => {
    const key = 'k1';
    expect(rateLimit(key, 3, 60_000).ok).toBe(true);
    expect(rateLimit(key, 3, 60_000).ok).toBe(true);
    expect(rateLimit(key, 3, 60_000).ok).toBe(true);
    const blocked = rateLimit(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it('zaehlt Schluessel unabhaengig', () => {
    expect(rateLimit('a', 1, 60_000).ok).toBe(true);
    expect(rateLimit('a', 1, 60_000).ok).toBe(false);
    expect(rateLimit('b', 1, 60_000).ok).toBe(true);
  });

  it('setzt das Fenster nach Ablauf zurueck', () => {
    expect(rateLimit('c', 1, 1).ok).toBe(true);
    // Fenster von 1 ms ist nach diesem Tick abgelaufen.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(rateLimit('c', 1, 1).ok).toBe(true);
        resolve();
      }, 5);
    });
  });
});

describe('clientKeyFromHeaders', () => {
  it('nimmt die erste IP aus x-forwarded-for', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' });
    expect(clientKeyFromHeaders(headers)).toBe('203.0.113.7');
  });

  it('faellt auf x-real-ip zurueck', () => {
    expect(clientKeyFromHeaders(new Headers({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
  });

  it('liefert "unknown" ohne IP-Header', () => {
    expect(clientKeyFromHeaders(new Headers())).toBe('unknown');
  });
});
