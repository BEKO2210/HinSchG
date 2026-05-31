import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { INBOX_SESSION_TTL_SECONDS, createInboxSession, verifyInboxSession } from './session';

beforeAll(() => {
  process.env.SESSION_SECRET = 'test-session-secret-mindestens-16-zeichen';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createInboxSession / verifyInboxSession', () => {
  it('Roundtrip liefert die caseId zurueck', () => {
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

  it('laeuft nach Ablauf der TTL ab', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { value } = createInboxSession('case_123');
    expect(verifyInboxSession(value)).toBe('case_123');

    vi.advanceTimersByTime((INBOX_SESSION_TTL_SECONDS + 1) * 1000);
    expect(verifyInboxSession(value)).toBeNull();
  });
});
