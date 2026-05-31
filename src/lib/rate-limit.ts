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
let lastSweep = 0;

function sweep(now: number): void {
  // Selten aufraeumen, damit die Map nicht unbegrenzt waechst.
  if (now - lastSweep < 60_000) {
    return;
  }
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
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

/** Nur fuer Tests: setzt den internen Zustand zurueck. */
export function resetRateLimitState(): void {
  buckets.clear();
  lastSweep = 0;
}
