import { describe, expect, it } from 'vitest';
import { isValidOfficeSlug } from './office';

describe('isValidOfficeSlug', () => {
  it('akzeptiert gültige Slugs', () => {
    expect(isValidOfficeSlug('demo')).toBe(true);
    expect(isValidOfficeSlug('kanzlei-mueller')).toBe(true);
    expect(isValidOfficeSlug('a')).toBe(true);
    expect(isValidOfficeSlug('office-123')).toBe(true);
    expect(isValidOfficeSlug('a'.repeat(64))).toBe(true);
  });

  it('lehnt ungültige Slugs ab', () => {
    expect(isValidOfficeSlug('')).toBe(false);
    expect(isValidOfficeSlug('-demo')).toBe(false);
    expect(isValidOfficeSlug('demo-')).toBe(false);
    expect(isValidOfficeSlug('Demo')).toBe(false); // Großbuchstaben
    expect(isValidOfficeSlug('demo office')).toBe(false); // Leerzeichen
    expect(isValidOfficeSlug('demo/../etc')).toBe(false); // Pfad-Trick
    expect(isValidOfficeSlug('a'.repeat(65))).toBe(false); // zu lang
    expect(isValidOfficeSlug('café')).toBe(false); // Unicode
  });

  it('lehnt Nicht-Strings ab', () => {
    expect(isValidOfficeSlug(undefined)).toBe(false);
    expect(isValidOfficeSlug(null)).toBe(false);
    expect(isValidOfficeSlug(123)).toBe(false);
    expect(isValidOfficeSlug({})).toBe(false);
  });
});
