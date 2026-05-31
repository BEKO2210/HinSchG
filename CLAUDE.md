# HinSchG — Projektkontext für Claude Code

Du arbeitest am Repo BEKO2210/HinSchG: einer Open-Source-Hinweisgeber- und
Compliance-Plattform nach HinSchG / EU-Richtlinie 2019/1937.

## Verbindliche Prinzipien

- Datenminimierung: KEINE Speicherung von IP, User-Agent, E-Mail-Pflicht oder
  Klartext-Identität des Hinweisgebers. Was nicht existiert, kann nicht geleakt werden.
- Der Betreiber ist Teil des Bedrohungsmodells.
- Zugang für Hinweisgeber NUR über einen hochentropischen Receipt-Token, nie Accounts.
- Receipt-Tokens werden ausschließlich als Argon2id-Hash gespeichert, nie im Klartext.
- Auditierte Krypto-Primitive (libsodium / @noble), kein Eigenbau.
- Lizenz: AGPLv3.

## Tech-Stack (fix)

- Next.js 14 App Router + TypeScript (strict)
- PostgreSQL 16 + Prisma
- Tailwind CSS, minimalistisches, klares Design
- Argon2id (argon2), TOTP (otplib), libsodium-wrappers
- Docker Compose für Deployment
- Zielumgebung: Linux, Docker, Node 20+

## Setup-Befehle (für die Sandbox)

- Install: `npm install`
- DB-Migration: `npx prisma migrate dev`
- Lint/Build: `npm run lint && npm run build`

## Arbeitsweise

- Immer vollständigen, lauffähigen Code liefern, nie Platzhalter-Snippets.
- Pro PR: kurze Liste der erstellten/geänderten Dateien + Testanleitung in der PR-Beschreibung.
- Sicherheitsrelevante Entscheidungen knapp begründen.
- Bei sicherheitskritischer Mehrdeutigkeit nachfragen statt raten.
- Details zu Datenmodell, Bedrohungsmodell und Krypto: siehe ARCHITECTURE.md.
