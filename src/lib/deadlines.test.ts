import { describe, expect, it } from 'vitest';
import { ACK_WARN_MS, caseUrgency, formatDeadlineRelative, trafficLight } from './deadlines';

const NOW = new Date('2026-05-31T12:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

describe('trafficLight', () => {
  it('liefert done, wenn die Pflicht erfüllt ist', () => {
    expect(trafficLight(new Date(NOW - DAY), true, ACK_WARN_MS, NOW)).toBe('done');
  });

  it('liefert overdue, wenn die Frist vorbei ist', () => {
    expect(trafficLight(new Date(NOW - 1), false, ACK_WARN_MS, NOW)).toBe('overdue');
  });

  it('liefert soon innerhalb der Vorwarnzeit', () => {
    expect(trafficLight(new Date(NOW + DAY), false, ACK_WARN_MS, NOW)).toBe('soon');
  });

  it('liefert ok mit ausreichend Vorlauf', () => {
    expect(trafficLight(new Date(NOW + 10 * DAY), false, ACK_WARN_MS, NOW)).toBe('ok');
  });
});

describe('caseUrgency', () => {
  it('ist Infinity, wenn beide Fristen erfüllt sind', () => {
    const u = caseUrgency(new Date(NOW + DAY), true, new Date(NOW + DAY), true, NOW);
    expect(u).toBe(Number.POSITIVE_INFINITY);
  });

  it('priorisiert Überfälliges (negativer Wert) vor künftigen Fristen', () => {
    const overdue = caseUrgency(new Date(NOW - DAY), false, new Date(NOW + 90 * DAY), false, NOW);
    const future = caseUrgency(
      new Date(NOW + 5 * DAY),
      false,
      new Date(NOW + 90 * DAY),
      false,
      NOW,
    );
    expect(overdue).toBeLessThan(0);
    expect(overdue).toBeLessThan(future);
  });

  it('nimmt nur offene Fristen (erfüllte Ack wird ignoriert)', () => {
    const u = caseUrgency(new Date(NOW - DAY), true, new Date(NOW + 5 * DAY), false, NOW);
    expect(u).toBe(5 * DAY);
  });
});

describe('formatDeadlineRelative', () => {
  it('zeigt Überfälligkeit', () => {
    expect(formatDeadlineRelative(new Date(NOW - 2 * DAY), NOW)).toContain('überfällig');
  });

  it('zeigt zukünftige Fristen', () => {
    expect(formatDeadlineRelative(new Date(NOW + 3 * DAY), NOW)).toBe('in 3 Tag(en)');
  });
});
