import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  authThrottleStatus,
  clientKeyFromHeaders,
  rateLimit,
  recordAuthFailure,
  recordAuthSuccess,
  resetRateLimitState,
} from './rate-limit';

beforeEach(() => {
  resetRateLimitState();
});

afterEach(() => {
  vi.useRealTimers();
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

  it('zählt Schlüssel unabhängig', () => {
    expect(rateLimit('a', 1, 60_000).ok).toBe(true);
    expect(rateLimit('a', 1, 60_000).ok).toBe(false);
    expect(rateLimit('b', 1, 60_000).ok).toBe(true);
  });

  it('setzt das Fenster nach Ablauf zurück', () => {
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

  it('fällt auf x-real-ip zurück', () => {
    expect(clientKeyFromHeaders(new Headers({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
  });

  it('liefert "unknown" ohne IP-Header', () => {
    expect(clientKeyFromHeaders(new Headers())).toBe('unknown');
  });

  it('fällt bei leerem x-forwarded-for auf x-real-ip / unknown zurück', () => {
    // Leerer erster Eintrag -> nicht als IP akzeptiert.
    expect(clientKeyFromHeaders(new Headers({ 'x-forwarded-for': '   ' }))).toBe('unknown');
    expect(
      clientKeyFromHeaders(new Headers({ 'x-forwarded-for': '  ', 'x-real-ip': '198.51.100.9' })),
    ).toBe('198.51.100.9');
  });
});

describe('Auth-Backoff', () => {
  it('ist initial nicht gesperrt', () => {
    expect(authThrottleStatus('x').blocked).toBe(false);
  });

  it('sperrt nach einem Fehlversuch und steigert exponentiell', () => {
    recordAuthFailure('x');
    const first = authThrottleStatus('x');
    expect(first.blocked).toBe(true);
    expect(first.retryAfterSec).toBeGreaterThan(0);

    recordAuthFailure('x');
    const second = authThrottleStatus('x');
    // Zweiter Fehlversuch -> längere Sperre als der erste.
    expect(second.retryAfterSec).toBeGreaterThanOrEqual(first.retryAfterSec);
  });

  it('setzt die Sperre nach Erfolg zurück', () => {
    recordAuthFailure('y');
    expect(authThrottleStatus('y').blocked).toBe(true);
    recordAuthSuccess('y');
    expect(authThrottleStatus('y').blocked).toBe(false);
  });

  it('deckelt die Backoff-Dauer bei vielen Fehlversuchen (Brute-Force)', () => {
    // Simuliert einen Brute-Force-Angriff: viele Fehlversuche in Folge.
    for (let i = 0; i < 20; i++) {
      recordAuthFailure('bruteforce');
    }
    const status = authThrottleStatus('bruteforce');
    expect(status.blocked).toBe(true);
    // Deckel ist 5 Minuten (BACKOFF_MAX_MS) -> retryAfterSec <= 300.
    expect(status.retryAfterSec).toBeLessThanOrEqual(300);
    expect(status.retryAfterSec).toBeGreaterThan(60);
  });
});

describe('rateLimit — Erschöpfung & Fenster-Reset (sweep)', () => {
  it('blockt nach Erschöpfung und setzt nach Fensterablauf zurück', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const key = 'window';
    expect(rateLimit(key, 2, 1_000).ok).toBe(true);
    expect(rateLimit(key, 2, 1_000).ok).toBe(true);
    const blocked = rateLimit(key, 2, 1_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);

    // Nach Ablauf des Fensters + sweep-Intervall (>60s) ist wieder frei.
    vi.advanceTimersByTime(61_000);
    expect(rateLimit(key, 2, 1_000).ok).toBe(true);
    vi.useRealTimers();
  });

  it('sweep räumt abgelaufene Auth-Backoff-Einträge auf', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:00:00Z'));
    recordAuthFailure('old');
    expect(authThrottleStatus('old').blocked).toBe(true);
    // Weit nach Ablauf der Sperre + 10-min-Verfall -> sweep entfernt den Eintrag.
    vi.advanceTimersByTime(20 * 60_000);
    // Ein rateLimit-Aufruf triggert sweep; danach ist der alte Eintrag weg.
    rateLimit('trigger-sweep', 5, 1_000);
    expect(authThrottleStatus('old').blocked).toBe(false);
    vi.useRealTimers();
  });
});
