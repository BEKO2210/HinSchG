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
