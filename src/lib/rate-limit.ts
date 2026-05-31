// HinSchG — In-Memory Rate Limiting (Fixed Window)
//
// Schutz gegen Missbrauch/Brute-Force (Bedrohung T7) ohne Persistenz: Die
// Zähler liegen ausschließlich flüchtig im Arbeitsspeicher und werden NIE in
// die Datenbank oder in Logs geschrieben. Der Schlüssel (z. B. IP) wird nur
// transient zum Zählen verwendet — im Einklang mit der Datenminimierung.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const attempts = new Map<string, AuthAttempt>();
let lastSweep = 0;

function sweep(now: number): void {
  // Selten aufräumen, damit die Maps nicht unbegrenzt wachsen.
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
    // Einträge verfallen, sobald die Sperre abgelaufen ist und eine Weile
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
  /** Sekunden bis zum Zurücksetzen des Fensters (für Retry-After). */
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
 * Leitet einen transienten Rate-Limit-Schlüssel aus den Request-Headern ab.
 * Die IP wird ausschließlich flüchtig für das Limiting genutzt und nirgends
 * gespeichert. Fällt auf einen gemeinsamen Schlüssel zurück, wenn keine IP
 * ermittelbar ist (dann gilt das Limit global).
 *
 * Sicherheit: `x-forwarded-for`/`x-real-ip` sind clientseitig fälschbar. Sie
 * werden NUR ausgewertet, wenn die App ausdrücklich hinter einem
 * vertrauenswürdigen Reverse-Proxy läuft (`TRUST_PROXY_HEADERS=true`, z. B. der
 * mitgelieferte Caddy). Ohne diese Einstellung würde ein Angreifer sonst durch
 * frei wählbare Header pro Request einen neuen Schlüssel erzeugen und das Limit
 * umgehen — daher wird dann bewusst ein gemeinsamer Schlüssel verwendet.
 *
 * Aus `x-forwarded-for` wird der LETZTE (rechte) Eintrag genommen: Jeder Proxy
 * hängt die von ihm gesehene Adresse rechts an, der vertrauenswürdige Proxy
 * (eine Hop-Tiefe) liefert also rechts die echte Client-IP. Vom Client links
 * eingeschmuggelte Werte werden so ignoriert.
 */
export function clientKeyFromHeaders(headers: Headers): string {
  if (process.env.TRUST_PROXY_HEADERS !== 'true') {
    return 'unknown';
  }
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) {
      return last;
    }
  }
  return headers.get('x-real-ip')?.trim() || 'unknown';
}

// --- Exponentielles Backoff für Auth-Versuche (Token-Login) -----------------
// Schützt das Postfach gegen Brute-Force des Receipt-Tokens (T7). Nach jedem
// Fehlversuch wächst die Wartezeit exponentiell; ein Erfolg setzt sie zurück.

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

/** Prüft, ob für den Schlüssel aktuell eine Backoff-Sperre aktiv ist. */
export function authThrottleStatus(key: string): AuthThrottleStatus {
  const now = Date.now();
  sweep(now);
  const attempt = attempts.get(key);
  if (attempt && attempt.lockedUntil > now) {
    return { blocked: true, retryAfterSec: Math.ceil((attempt.lockedUntil - now) / 1000) };
  }
  return { blocked: false, retryAfterSec: 0 };
}

/** Vermerkt einen Fehlversuch und verlängert die Sperre exponentiell. */
export function recordAuthFailure(key: string): void {
  const now = Date.now();
  const attempt = attempts.get(key) ?? { failures: 0, lockedUntil: 0 };
  attempt.failures += 1;
  const delay = Math.min(BACKOFF_BASE_MS * 2 ** (attempt.failures - 1), BACKOFF_MAX_MS);
  attempt.lockedUntil = now + delay;
  attempts.set(key, attempt);
}

/** Setzt den Backoff nach erfolgreicher Authentifizierung zurück. */
export function recordAuthSuccess(key: string): void {
  attempts.delete(key);
}

/** Nur für Tests: setzt den internen Zustand zurück. */
export function resetRateLimitState(): void {
  buckets.clear();
  attempts.clear();
  lastSweep = 0;
}
