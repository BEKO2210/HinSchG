import { describe, expect, it } from 'vitest';
import { isCaseExpired } from './retention';

const NOW = new Date('2026-05-31T12:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

describe('isCaseExpired', () => {
  it('ist false für nicht geschlossene Fälle (closedAt null)', () => {
    expect(isCaseExpired(null, 30, NOW)).toBe(false);
  });

  it('ist false, wenn die Aufbewahrung deaktiviert ist (0 Tage)', () => {
    expect(isCaseExpired(new Date(NOW - 1000 * DAY), 0, NOW)).toBe(false);
  });

  it('ist false innerhalb der Frist', () => {
    expect(isCaseExpired(new Date(NOW - 10 * DAY), 30, NOW)).toBe(false);
  });

  it('ist true nach Ablauf der Frist', () => {
    expect(isCaseExpired(new Date(NOW - 31 * DAY), 30, NOW)).toBe(true);
  });
});
