import { createHmac } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  INBOX_SESSION_TTL_SECONDS,
  createAdminPreAuth,
  createAdminSession,
  createInboxSession,
  createOidcFlowState,
  oidcFlowCookieOptions,
  sessionCookieOptions,
  verifyAdminPreAuth,
  verifyAdminSession,
  verifyInboxSession,
  verifyOidcFlowState,
} from './session';

beforeAll(() => {
  process.env.SESSION_SECRET = 'test-session-secret-mindestens-16-zeichen';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createInboxSession / verifyInboxSession', () => {
  it('Roundtrip liefert die caseId zurück', () => {
    const { value } = createInboxSession('case_123');
    expect(verifyInboxSession(value)).toBe('case_123');
  });

  it('lehnt eine manipulierte Signatur ab', () => {
    const { value } = createInboxSession('case_123');
    const tampered = `${value.slice(0, -2)}xx`;
    expect(verifyInboxSession(tampered)).toBeNull();
  });

  it('lehnt einen manipulierten Payload ab', () => {
    const { value } = createInboxSession('case_123');
    const [, sig] = value.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ c: 'anderer_fall', exp: 9999999999 }),
    ).toString('base64url');
    expect(verifyInboxSession(`${forgedPayload}.${sig}`)).toBeNull();
  });

  it('lehnt undefinierte / leere Werte ab', () => {
    expect(verifyInboxSession(undefined)).toBeNull();
    expect(verifyInboxSession('')).toBeNull();
    expect(verifyInboxSession('keinpunkt')).toBeNull();
  });

  it('läuft nach Ablauf der TTL ab', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { value } = createInboxSession('case_123');
    expect(verifyInboxSession(value)).toBe('case_123');

    vi.advanceTimersByTime((INBOX_SESSION_TTL_SECONDS + 1) * 1000);
    expect(verifyInboxSession(value)).toBeNull();
  });
});

describe('Admin-Session', () => {
  it('Roundtrip liefert handlerId und Rolle', () => {
    const { value } = createAdminSession('h_1', 'ADMIN', 'office_1');
    expect(verifyAdminSession(value)).toEqual({ h: 'h_1', r: 'ADMIN', o: 'office_1' });
  });

  it('akzeptiert keine Inbox-Session als Admin-Session', () => {
    const { value } = createInboxSession('case_1');
    expect(verifyAdminSession(value)).toBeNull();
  });

  it('bindet die Session an die officeId (Mandant)', () => {
    const { value } = createAdminSession('h_9', 'HANDLER', 'office_42');
    expect(verifyAdminSession(value)?.o).toBe('office_42');
  });

  it('verwirft eine korrekt signierte Session ohne officeId (alte Cookies)', () => {
    // Signierte Session im alten Format { h, r } ohne o — muss nach der
    // Multi-Tenant-Umstellung abgelehnt werden (erzwingt Re-Login statt
    // Zugriff ohne Mandantenbindung).
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const encoded = Buffer.from(JSON.stringify({ d: { h: 'h_1', r: 'ADMIN' }, exp })).toString(
      'base64url',
    );
    const sig = createHmac('sha256', process.env.SESSION_SECRET as string)
      .update(encoded)
      .digest('base64url');
    expect(verifyAdminSession(`${encoded}.${sig}`)).toBeNull();
  });
});

describe('Admin-Pre-Auth', () => {
  it('Roundtrip mit Setup-Secret', () => {
    const { value } = createAdminPreAuth({ h: 'h_1', setup: true, s: 'verschlüsselt' });
    expect(verifyAdminPreAuth(value)).toEqual({ h: 'h_1', setup: true, s: 'verschlüsselt' });
  });

  it('akzeptiert keine Admin-Session als Pre-Auth (fehlendes setup-Flag)', () => {
    const { value } = createAdminSession('h_1', 'HANDLER', 'office_1');
    expect(verifyAdminPreAuth(value)).toBeNull();
  });
});

describe('OIDC-Flow-State', () => {
  it('Roundtrip liefert state + PKCE-Verifier zurück', () => {
    const { value } = createOidcFlowState({ st: 'state-xyz', v: 'verifier-abc' });
    expect(verifyOidcFlowState(value)).toEqual({ st: 'state-xyz', v: 'verifier-abc' });
  });

  it('lehnt fehlende/ungültige Werte ab', () => {
    expect(verifyOidcFlowState(undefined)).toBeNull();
    // Eine Admin-Session ist kein gültiger Flow-State (fehlende Felder st/v).
    const { value } = createAdminSession('h_1', 'ADMIN', 'office_1');
    expect(verifyOidcFlowState(value)).toBeNull();
  });
});

describe('verifyAdminSession — Rollenprüfung', () => {
  function signEnvelope(d: unknown): string {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const encoded = Buffer.from(JSON.stringify({ d, exp })).toString('base64url');
    const sig = createHmac('sha256', process.env.SESSION_SECRET as string)
      .update(encoded)
      .digest('base64url');
    return `${encoded}.${sig}`;
  }

  it('verwirft eine korrekt signierte Session mit ungültiger Rolle', () => {
    expect(verifyAdminSession(signEnvelope({ h: 'h_1', r: 'ROOT', o: 'office_1' }))).toBeNull();
  });

  it('akzeptiert SUPERADMIN/HANDLER/AUDITOR', () => {
    for (const r of ['SUPERADMIN', 'HANDLER', 'AUDITOR'] as const) {
      expect(verifyAdminSession(createAdminSession('h', r, 'o').value)?.r).toBe(r);
    }
  });
});

const TEST_SECRET = 'test-session-secret-mindestens-16-zeichen';

describe('SESSION_SECRET-Pflicht', () => {
  afterEach(() => {
    process.env.SESSION_SECRET = TEST_SECRET;
  });

  it('wirft, wenn das Secret fehlt oder zu kurz ist', () => {
    delete process.env.SESSION_SECRET;
    expect(() => createInboxSession('c')).toThrow('SESSION_SECRET');
    process.env.SESSION_SECRET = 'kurz';
    expect(() => createInboxSession('c')).toThrow('>= 16');
  });

  it('lehnt bekannte Platzhalterwerte ab (auch wenn lang genug)', () => {
    // Der Compose-Platzhalter ist > 16 Zeichen, darf aber nie produktiv greifen.
    process.env.SESSION_SECRET = 'bitte-ersetzen-langes-zufaelliges-secret';
    expect(() => createInboxSession('c')).toThrow('Platzhalter');
    process.env.SESSION_SECRET = 'CHANGEME-CHANGEME-CHANGEME';
    expect(() => createInboxSession('c')).toThrow('Platzhalter');
  });
});

describe('verifyToken — kaputter Payload', () => {
  it('gibt null zurück, wenn der signierte Payload kein gültiges JSON ist', () => {
    // Gültige Signatur über einen Nicht-JSON-Payload -> JSON.parse-Catch.
    const encoded = Buffer.from('das-ist-kein-json').toString('base64url');
    const sig = createHmac('sha256', process.env.SESSION_SECRET as string)
      .update(encoded)
      .digest('base64url');
    expect(verifyInboxSession(`${encoded}.${sig}`)).toBeNull();
  });
});

describe('Cookie-Optionen', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('setzt secure nur in Produktion', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(sessionCookieOptions(60).secure).toBe(true);
    vi.stubEnv('NODE_ENV', 'test');
    expect(sessionCookieOptions(60).secure).toBe(false);
  });

  it('oidcFlowCookieOptions nutzt SameSite=lax, behält httpOnly', () => {
    const opts = oidcFlowCookieOptions(600);
    expect(opts.sameSite).toBe('lax');
    expect(opts.httpOnly).toBe(true);
    expect(opts.maxAge).toBe(600);
  });
});
