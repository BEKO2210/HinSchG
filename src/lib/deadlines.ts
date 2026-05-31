// HinSchG — Fristen-Ampel (HinSchG: 7 Tage Eingangsbestätigung, 3 Monate Rückmeldung)
//
// Pure Logik (kein IO), damit unit-testbar. Liefert eine Ampelstufe und eine
// Sortier-Dringlichkeit, damit Fälliges/Überfälliges im Dashboard oben steht.

export type DeadlineLevel = 'done' | 'ok' | 'soon' | 'overdue';

const DAY_MS = 24 * 60 * 60 * 1000;

// Vorwarnzeit, ab der die Ampel auf Gelb springt.
export const ACK_WARN_MS = 2 * DAY_MS; // 2 Tage vor Ablauf der Eingangsbestätigung
export const FEEDBACK_WARN_MS = 14 * DAY_MS; // 14 Tage vor Ablauf der Rückmeldung

/**
 * Ampelstufe für eine Frist. Ist die Pflicht bereits erfüllt (done=true),
 * gilt 'done'. Sonst: überfällig / bald fällig / im grünen Bereich.
 */
export function trafficLight(
  deadline: Date,
  done: boolean,
  warnWithinMs: number,
  now: number = Date.now(),
): DeadlineLevel {
  if (done) {
    return 'done';
  }
  const diff = deadline.getTime() - now;
  if (diff < 0) {
    return 'overdue';
  }
  if (diff <= warnWithinMs) {
    return 'soon';
  }
  return 'ok';
}

/**
 * Dringlichkeit eines Falls für die Sortierung (kleiner = dringender).
 * Berücksichtigt nur noch nicht erfüllte Fristen; vollständig erledigte Fälle
 * landen hinten (Infinity).
 */
export function caseUrgency(
  ackDeadline: Date,
  ackDone: boolean,
  feedbackDeadline: Date,
  feedbackDone: boolean,
  now: number = Date.now(),
): number {
  const pending: number[] = [];
  if (!ackDone) {
    pending.push(ackDeadline.getTime() - now);
  }
  if (!feedbackDone) {
    pending.push(feedbackDeadline.getTime() - now);
  }
  if (pending.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.min(...pending);
}

/** Menschlicher Resttext, z. B. „in 3 Tagen" oder „2 Tage überfällig". */
export function formatDeadlineRelative(deadline: Date, now: number = Date.now()): string {
  const diffDays = Math.round((deadline.getTime() - now) / DAY_MS);
  if (diffDays < 0) {
    return `${Math.abs(diffDays)} Tag(e) überfällig`;
  }
  if (diffDays === 0) {
    return 'heute fällig';
  }
  return `in ${diffDays} Tag(en)`;
}
