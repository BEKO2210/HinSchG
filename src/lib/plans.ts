// HinSchG — Managed-Layer: Tarife & Limits (Phase 10a)
//
// Pur (kein IO), damit unit-testbar. Die Limits sind hier im Code definiert
// (nicht in der DB), damit sie versioniert und nachvollziehbar bleiben.
//
// WICHTIG (Datenschutz/Self-Hosting): Dieses Modul enthaelt KEINE Zahlungsdaten.
// Limits werden NUR erzwungen, wenn der Managed-Layer aktiviert ist
// (BILLING_ENABLED=true). Ohne Konfiguration (Standard fuer Self-Hoster) gelten
// keine Limits — die Instanz verhaelt sich wie zuvor.

export type Plan = 'FREE' | 'PRO' | 'ENTERPRISE';
export type PlanStatus = 'ACTIVE' | 'SUSPENDED';

export const PLANS: readonly Plan[] = ['FREE', 'PRO', 'ENTERPRISE'];
export const PLAN_STATUSES: readonly PlanStatus[] = ['ACTIVE', 'SUSPENDED'];

export interface PlanDefinition {
  /** Anzeigename des Tarifs. */
  label: string;
  /** Maximale Zahl an Bearbeiter:innen je Meldestelle; null = unbegrenzt. */
  maxHandlers: number | null;
}

export const PLAN_DEFINITIONS: Record<Plan, PlanDefinition> = {
  FREE: { label: 'Free', maxHandlers: 3 },
  PRO: { label: 'Pro', maxHandlers: 25 },
  ENTERPRISE: { label: 'Enterprise', maxHandlers: null },
};

export function isPlan(value: unknown): value is Plan {
  return typeof value === 'string' && (PLANS as readonly string[]).includes(value);
}

export function isPlanStatus(value: unknown): value is PlanStatus {
  return typeof value === 'string' && (PLAN_STATUSES as readonly string[]).includes(value);
}

export function planLabel(plan: Plan): string {
  return PLAN_DEFINITIONS[plan].label;
}

/**
 * Ist der Managed-/Billing-Layer aktiviert? Standardmaessig AUS — Self-Hoster
 * ohne Konfiguration laufen ohne jegliche Plan-Limits.
 */
export function isBillingEnabled(): boolean {
  return process.env.BILLING_ENABLED === 'true';
}

/**
 * Prueft, ob noch ein:e weitere:r Bearbeiter:in angelegt werden darf.
 * Bei deaktiviertem Managed-Layer immer true (keine Limits). ENTERPRISE bzw.
 * `maxHandlers = null` ist unbegrenzt.
 */
export function canAddHandler(plan: Plan, currentHandlerCount: number): boolean {
  if (!isBillingEnabled()) {
    return true;
  }
  const limit = PLAN_DEFINITIONS[plan].maxHandlers;
  if (limit === null) {
    return true;
  }
  return currentHandlerCount < limit;
}

/**
 * Liefert die Stripe-Price-ID fuer einen kostenpflichtigen Tarif aus der
 * Umgebung (STRIPE_PRICE_PRO / STRIPE_PRICE_ENTERPRISE). FREE hat keinen Preis.
 * Null, wenn nicht konfiguriert.
 */
export function stripePriceIdFor(plan: Plan): string | null {
  switch (plan) {
    case 'PRO':
      return process.env.STRIPE_PRICE_PRO || null;
    case 'ENTERPRISE':
      return process.env.STRIPE_PRICE_ENTERPRISE || null;
    default:
      return null;
  }
}

/**
 * Darf eine Meldestelle neue Meldungen annehmen? Eine deaktivierte Meldestelle
 * (`active=false`) niemals. Ein nicht bezahltes Abo (`SUSPENDED`) sperrt die
 * oeffentliche Meldestrecke ebenfalls — ABER nur, wenn Billing aktiviert ist
 * (Self-Hoster ohne Billing sind nie gesperrt). Bestehende Faelle bleiben fuer
 * Bearbeiter:innen unabhaengig davon lesbar (woanders durchgesetzt).
 */
export function officeAcceptsReports(office: { active: boolean; planStatus: PlanStatus }): boolean {
  if (!office.active) {
    return false;
  }
  if (isBillingEnabled() && office.planStatus === 'SUSPENDED') {
    return false;
  }
  return true;
}

/** Umgekehrte Zuordnung: zu welcher Stripe-Price-ID gehoert welcher Tarif? */
export function planForStripePriceId(priceId: string): Plan | null {
  if (priceId && priceId === process.env.STRIPE_PRICE_PRO) {
    return 'PRO';
  }
  if (priceId && priceId === process.env.STRIPE_PRICE_ENTERPRISE) {
    return 'ENTERPRISE';
  }
  return null;
}
