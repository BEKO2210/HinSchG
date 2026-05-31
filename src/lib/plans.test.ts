import { afterEach, describe, expect, it } from 'vitest';
import { canAddHandler, isBillingEnabled, isPlan, isPlanStatus, planLabel } from './plans';

const ORIGINAL = process.env.BILLING_ENABLED;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.BILLING_ENABLED;
  else process.env.BILLING_ENABLED = ORIGINAL;
});

describe('Plan-Guards', () => {
  it('isPlan erkennt gültige Tarife', () => {
    expect(isPlan('FREE')).toBe(true);
    expect(isPlan('PRO')).toBe(true);
    expect(isPlan('ENTERPRISE')).toBe(true);
    expect(isPlan('GOLD')).toBe(false);
    expect(isPlan(undefined)).toBe(false);
  });

  it('isPlanStatus erkennt gültige Status', () => {
    expect(isPlanStatus('ACTIVE')).toBe(true);
    expect(isPlanStatus('SUSPENDED')).toBe(true);
    expect(isPlanStatus('PAUSED')).toBe(false);
  });

  it('planLabel liefert Anzeigenamen', () => {
    expect(planLabel('FREE')).toBe('Free');
    expect(planLabel('ENTERPRISE')).toBe('Enterprise');
  });
});

describe('isBillingEnabled', () => {
  it('ist standardmäßig aus', () => {
    delete process.env.BILLING_ENABLED;
    expect(isBillingEnabled()).toBe(false);
    process.env.BILLING_ENABLED = 'false';
    expect(isBillingEnabled()).toBe(false);
  });

  it('ist nur bei exakt "true" an', () => {
    process.env.BILLING_ENABLED = 'true';
    expect(isBillingEnabled()).toBe(true);
  });
});

describe('canAddHandler', () => {
  it('erlaubt ohne Managed-Layer alles (kein Limit)', () => {
    delete process.env.BILLING_ENABLED;
    expect(canAddHandler('FREE', 999)).toBe(true);
  });

  it('erzwingt Limits nur bei aktivem Managed-Layer', () => {
    process.env.BILLING_ENABLED = 'true';
    expect(canAddHandler('FREE', 2)).toBe(true); // 2 < 3
    expect(canAddHandler('FREE', 3)).toBe(false); // Limit erreicht
    expect(canAddHandler('PRO', 24)).toBe(true);
    expect(canAddHandler('PRO', 25)).toBe(false);
  });

  it('ENTERPRISE ist unbegrenzt', () => {
    process.env.BILLING_ENABLED = 'true';
    expect(canAddHandler('ENTERPRISE', 100000)).toBe(true);
  });
});
