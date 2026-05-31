# HinSchG — Projektkontext für Claude Code

Du arbeitest am Repo BEKO2210/HinSchG: einer Open-Source-Hinweisgeber- und
Compliance-Plattform nach HinSchG / EU-Richtlinie 2019/1937.

## Verbindliche Prinzipien

- Datenminimierung: KEINE Speicherung von IP, User-Agent, E-Mail-Pflicht oder
  Klartext-Identitaet des Hinweisgebers. Was nicht existiert, kann nicht geleakt werden.
- Der Betreiber ist Teil des Bedrohungsmodells.
- Zugang fuer Hinweisgeber NUR ueber einen hochentropischen Receipt-Token, nie Accounts.
- Receipt-Tokens werden ausschliesslich als Argon2id-Hash gespeichert, nie im Klartext.
- Auditierte Krypto-Primitive (libsodium / @noble), kein Eigenbau.
- Lizenz: AGPLv3.

## Tech-Stack (fix)

- Next.js 14 App Router + TypeScript (strict)
- PostgreSQL 16 + Prisma
- Tailwind CSS, minimalistisches, klares Design
- Argon2id (argon2), TOTP (otplib), libsodium-wrappers
- Docker Compose fuer Deployment
- Zielumgebung: Linux, Docker, Node 20+

## Setup-Befehle (fuer die Sandbox)

- Install: `npm install`
- DB-Migration: `npx prisma migrate dev`
- Lint/Build: `npm run lint && npm run build`

## Arbeitsweise

- Immer vollstaendigen, lauffaehigen Code liefern, nie Platzhalter-Snippets.
- Pro PR: kurze Liste der erstellten/geaenderten Dateien + Testanleitung in der PR-Beschreibung.
- Sicherheitsrelevante Entscheidungen knapp begruenden.
- Bei sicherheitskritischer Mehrdeutigkeit nachfragen statt raten.
- Details zu Datenmodell, Bedrohungsmodell und Krypto: siehe ARCHITECTURE.md.
