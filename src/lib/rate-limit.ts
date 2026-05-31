// HinSchG — In-Memory Rate Limiting (Fixed Window)
//
// Schutz gegen Missbrauch/Brute-Force (Bedrohung T7) ohne Persistenz: Die
// Zaehler liegen ausschliesslich fluechtig im Arbeitsspeicher und werden NIE in
// die Datenbank oder in Logs geschrieben. Der Schluessel (z. B. IP) wird nur
// transient zum Zaehlen verwendet — im Einklang mit der Datenminimierung.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const attempts = new Map<string, AuthAttempt>();
let lastSweep = 0;

function sweep(now: number): void {
  // Selten aufraeumen, damit die Maps nicht unbegrenzt wachsen.
  if (now - lastSweep < 60_000) {
    return;
  }
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
  for (const [key, attempt] of attempts) {
    // Eintraege verfallen, sobald die Sperre abgelaufen ist und eine Weile
    // (10 min) keine neuen Fehlversuche kamen.
    if (attempt.lockedUntil + 10 * 60_000 <= now) {
      attempts.delete(key);
    }
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Verbleibende Anfragen im aktuellen Fenster. */
  remaining: number;
  /** Sekunden bis zum Zuruecksetzen des Fensters (fuer Retry-After). */
  retryAfterSec: number;
}

/**
 * Fixed-Window-Limiter: erlaubt `limit` Anfragen pro `windowMs` je `key`.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { ok: true, remaining: limit - bucket.count, retryAfterSec: 0 };
}

/**
 * Leitet einen transienten Rate-Limit-Schluessel aus den Request-Headern ab.
 * Die IP wird ausschliesslich fluechtig fuer das Limiting genutzt und nirgends
 * gespeichert. Faellt auf einen gemeinsamen Schluessel zurueck, wenn keine IP
 * ermittelbar ist (dann gilt das Limit global).
 */
export function clientKeyFromHeaders(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }
  return headers.get('x-real-ip')?.trim() || 'unknown';
}

// --- Exponentielles Backoff fuer Auth-Versuche (Token-Login) -----------------
// Schuetzt das Postfach gegen Brute-Force des Receipt-Tokens (T7). Nach jedem
// Fehlversuch waechst die Wartezeit exponentiell; ein Erfolg setzt sie zurueck.

interface AuthAttempt {
  failures: number;
  lockedUntil: number;
}

const BACKOFF_BASE_MS = 1_000; // erster Fehlversuch: 1 s Sperre
const BACKOFF_MAX_MS = 5 * 60_000; // Deckel: 5 min

export interface AuthThrottleStatus {
  blocked: boolean;
  retryAfterSec: number;
}

/** Prueft, ob fuer den Schluessel aktuell eine Backoff-Sperre aktiv ist. */
export function authThrottleStatus(key: string): AuthThrottleStatus {
  const now = Date.now();
  sweep(now);
  const attempt = attempts.get(key);
  if (attempt && attempt.lockedUntil > now) {
    return { blocked: true, retryAfterSec: Math.ceil((attempt.lockedUntil - now) / 1000) };
  }
  return { blocked: false, retryAfterSec: 0 };
}

/** Vermerkt einen Fehlversuch und verlaengert die Sperre exponentiell. */
export function recordAuthFailure(key: string): void {
  const now = Date.now();
  const attempt = attempts.get(key) ?? { failures: 0, lockedUntil: 0 };
  attempt.failures += 1;
  const delay = Math.min(BACKOFF_BASE_MS * 2 ** (attempt.failures - 1), BACKOFF_MAX_MS);
  attempt.lockedUntil = now + delay;
  attempts.set(key, attempt);
}

/** Setzt den Backoff nach erfolgreicher Authentifizierung zurueck. */
export function recordAuthSuccess(key: string): void {
  attempts.delete(key);
}

/** Nur fuer Tests: setzt den internen Zustand zurueck. */
export function resetRateLimitState(): void {
  buckets.clear();
  attempts.clear();
  lastSweep = 0;
}
