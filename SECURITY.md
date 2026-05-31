# Sicherheit & verantwortungsvolle Offenlegung

HinSchG verarbeitet besonders schützenswerte Daten (Hinweise nach HinSchG). Wir
nehmen Sicherheitsmeldungen ernst und danken allen, die zur Absicherung
beitragen.

## Schwachstelle melden (Responsible Disclosure)

- Bitte **keine** öffentlichen Issues für Sicherheitslücken.
- Melden Sie Funde vertraulich an: **security@example.org** _(vor Produktivbetrieb durch eine echte Adresse ersetzen)_.
- Bitte geben Sie Reproduktionsschritte, betroffene Version/Commit und mögliche
  Auswirkungen an. Wir bestätigen den Eingang i. d. R. innerhalb von 5 Werktagen.
- Bitte gewähren Sie eine angemessene Frist zur Behebung, bevor Sie Details
  veröffentlichen (Coordinated Disclosure).

## Geltungsbereich

Relevant sind insbesondere:

- Kryptografie (`src/lib/crypto.ts`, `src/lib/e2e.ts`), Sessions
  (`src/lib/session.ts`), Auth/Rollen (`src/lib/admin-auth.ts`).
- Öffentliche Endpunkte (`/api/cases`, `/api/inbox/*`) und Admin-Endpunkte.
- Content-Security-Policy / Middleware, Rate-Limiting, Audit-Trail.

## Sicherheitsstand (ehrlich)

> **Stufe 1 (Standard):** Inhalte sind **verschlüsselt at rest** und
> datenminimiert — **nicht** Zero-Knowledge. Wer Datenbank **und** > `MASTER_ENCRYPTION_KEY` besitzt, kann Inhalte technisch lesen.
>
> **Stufe 2 (Ende-zu-Ende):** vorhanden und funktionsfähig, aber **standardmäßig
> deaktiviert** (`E2E_SUBMIT_ENABLED=false`) und **noch nicht extern auditiert**.
> Die Bezeichnung „Zero-Knowledge" wird erst nach einem **unabhängigen externen
> Security-Audit** verwendet.

Details zu Primitiven, Schlüsselfluss, Bedrohungsmodell, Review-Befunden und
Audit-Empfehlungen: **[docs/SECURITY-MODEL.md](./docs/SECURITY-MODEL.md)**.

## Grundsätze

- Datenminimierung: keine IP-Adressen, keine User-Agents, keine Pflicht-Identität.
- Auditierte Primitive (libsodium, @noble, @scure, otplib) — kein Eigenbau.
- Append-only Audit-Trail (auf Datenbankebene erzwungen).
