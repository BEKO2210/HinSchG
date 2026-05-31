import { describe, expect, it } from 'vitest';
import { isValidOfficeName, isValidOfficeSlug, slugifyOfficeName } from './office';

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

describe('isValidOfficeName', () => {
  it('akzeptiert sinnvolle Namen', () => {
    expect(isValidOfficeName('Kanzlei Müller')).toBe(true);
    expect(isValidOfficeName('AB')).toBe(true);
  });

  it('lehnt zu kurze/leere und Nicht-Strings ab', () => {
    expect(isValidOfficeName('A')).toBe(false);
    expect(isValidOfficeName('   ')).toBe(false);
    expect(isValidOfficeName('a'.repeat(121))).toBe(false);
    expect(isValidOfficeName(undefined)).toBe(false);
    expect(isValidOfficeName(42)).toBe(false);
  });
});

describe('slugifyOfficeName', () => {
  it('transliteriert Umlaute und normalisiert', () => {
    expect(slugifyOfficeName('Kanzlei Müller')).toBe('kanzlei-mueller');
    expect(slugifyOfficeName('Größe & Söhne')).toBe('groesse-soehne');
    expect(slugifyOfficeName('  Demo  Meldestelle  ')).toBe('demo-meldestelle');
  });

  it('erzeugt gültige Slugs (Roundtrip)', () => {
    expect(isValidOfficeSlug(slugifyOfficeName('Kanzlei Müller'))).toBe(true);
    expect(isValidOfficeSlug(slugifyOfficeName('ÖÄÜ Beratung'))).toBe(true);
  });
});
