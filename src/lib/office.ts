// HinSchG — Helfer rund um Meldestellen (Mandanten / Multi-Tenant)
//
// Phase 9b: Oeffentliche Melde-Strecke je Meldestelle ueber /m/[slug]/melden.
// Slugs sind oeffentlich (Teil der Melde-URL); sie enthalten keine
// personenbezogenen Daten. Strikte Validierung verhindert ungueltige Lookups
// und haelt die URL-Form vorhersagbar (Kleinbuchstaben, Ziffern, Bindestrich).

/**
 * Prueft, ob ein Wert ein gueltiger Meldestellen-Slug ist:
 * 1–64 Zeichen, nur a–z, 0–9 und Bindestrich, nicht mit Bindestrich beginnend
 * oder endend. Bewusst restriktiv (kein Unicode), damit URLs eindeutig bleiben.
 */
export function isValidOfficeSlug(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(value);
}

export const OFFICE_NAME_MIN = 2;
export const OFFICE_NAME_MAX = 120;

/** Prueft, ob ein Anzeigename fuer eine Meldestelle gueltig ist. */
export function isValidOfficeName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length >= OFFICE_NAME_MIN &&
    value.trim().length <= OFFICE_NAME_MAX
  );
}

/**
 * Leitet einen Slug-Vorschlag aus einem Namen ab (Kleinbuchstaben, Umlaute
 * transliteriert, nicht-alphanumerisch -> Bindestrich). Das Ergebnis wird
 * weiterhin mit {@link isValidOfficeSlug} geprueft.
 */
export function slugifyOfficeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
}
