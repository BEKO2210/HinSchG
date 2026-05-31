# HinSchG

**Open-Source-Hinweisgeber- & Compliance-Plattform** nach dem deutschen
Hinweisgeberschutzgesetz (HinSchG) und der EU-Whistleblower-Richtlinie
2019/1937.

> Status: **Phase 0 — Grundgerüst.** Meldestrecke, anonymes Postfach,
> Bearbeiter-Login und Dashboard folgen in den nächsten Phasen
> (siehe `ARCHITECTURE.md` und `HinSchG_BUILD_PROMPTS.md`).

---

## Was ist HinSchG?

HinSchG ist eine selbst-hostbare Plattform, mit der Organisationen die
gesetzlich vorgeschriebene **interne Meldestelle** betreiben können.
Hinweisgeber:innen können anonym Verstöße melden und über ein
token-basiertes Postfach mit der Meldestelle kommunizieren — ohne Account,
ohne Pflicht zur Angabe ihrer Identität.

Leitprinzipien (Details in [`ARCHITECTURE.md`](./ARCHITECTURE.md)):

- **Datenminimierung als Default** — keine IP-, User-Agent- oder
  Identitätsspeicherung. Was nicht existiert, kann nicht geleakt werden.
- **Der Betreiber ist Teil des Bedrohungsmodells** — das Design erschwert,
  dass selbst ein DB-Admin Hinweisgeber de-anonymisiert.
- **Zugang über Token statt Accounts** — ein hochentropischer Receipt-Code
  ist der einzige Schlüssel zum anonymen Postfach.
- **Compliance im Kern** — Fristen (7 Tage Eingangsbestätigung, 3 Monate
  Rückmeldung), Audit-Trail und revisionssichere Doku.

---

## Self-host-Quickstart (unter 10 Minuten)

Voraussetzungen: **Docker** und **Docker Compose** (Docker Desktop oder
`docker` + `docker compose`-Plugin).

```bash
# 1. Repository klonen
git clone https://github.com/BEKO2210/HinSchG.git
cd HinSchG

# 2. Umgebungsvariablen anlegen
cp .env.example .env

# 3. Secrets erzeugen und in .env eintragen
openssl rand -base64 32   # -> MASTER_ENCRYPTION_KEY
openssl rand -base64 48   # -> SESSION_SECRET

# 4. App + Datenbank starten
docker compose up --build
```

Danach ist die App unter **http://localhost:3000** erreichbar, die
PostgreSQL-Datenbank läuft im Service `db` (Healthcheck inklusive).
Zum Stoppen: `docker compose down` (Daten bleiben im Volume `postgres_data`
erhalten; `docker compose down -v` löscht auch die Daten).

### Lokale Entwicklung (ohne Docker)

```bash
npm install
cp .env.example .env                            # Werte anpassen (DATABASE_URL, Secrets, Seed-Admin)
npm run prisma:migrate                           # Migration anwenden + Prisma-Client generieren
SEED_ADMIN_PASSWORD="$(openssl rand -base64 24)" npm run prisma:seed   # Demo-Meldestelle + Admin
npm run dev                                      # http://localhost:3000
```

Nützliche Skripte:

| Befehl                    | Zweck                                       |
| ------------------------- | ------------------------------------------- |
| `npm run dev`             | Entwicklungsserver                          |
| `npm run build`           | Produktions-Build                           |
| `npm run lint`            | ESLint                                      |
| `npm run typecheck`       | TypeScript-Prüfung (strict)                 |
| `npm test`                | Unit-Tests (Vitest)                         |
| `npm run format`          | Prettier (schreibend)                       |
| `npm run prisma:validate` | Prisma-Schema validieren                    |
| `npm run prisma:migrate`  | Migration in der Entwicklung anwenden       |
| `npm run prisma:seed`     | Demo-Meldestelle + Admin-Bearbeiter anlegen |
| `npm run purge:cases`     | Abgelaufene geschlossene Fälle löschen      |

---

## Sicherheits-Disclaimer

> **Aktuelle Sicherheitsstufe: Stufe 1 — „verschlüsselt at rest + datenminimiert".**
>
> Meldungsinhalte werden symmetrisch (XChaCha20-Poly1305) mit einem
> Server-Master-Key verschlüsselt gespeichert, und es werden bewusst keine
> personenbezogenen Metadaten (IP, User-Agent, Pflicht-Identität) erhoben.
>
> **Dies ist NICHT Zero-Knowledge / Ende-zu-Ende-Verschlüsselung.** Ein
> Betreiber mit Zugriff auf Datenbank **und** Master-Key kann technisch den
> Klartext lesen. Die echte Ende-zu-Ende-Verschlüsselung (Stufe 2) ist als
> spätere Phase geplant und wird erst nach einem **externen
> Security-Audit** als „Zero-Knowledge" kommuniziert.
>
> **Rechtlicher Hinweis:** Das System _unterstuetzt_ die Erfüllung der
> HinSchG-Pflichten, ersetzt aber keine Rechtsberatung. Compliance-Aussagen
> sind vor Produktivbetrieb von einer qualifizierten Rechtsvertretung zu
> prüfen.

---

## Lizenz

Lizenziert unter der **GNU Affero General Public License v3.0 or later
(AGPL-3.0-or-later)** — siehe [`LICENSE`](./LICENSE).

Die AGPLv3 verlangt insbesondere, dass auch bei Bereitstellung der Software
als Netzwerkdienst der vollständige Quellcode (inkl. Änderungen) den
Nutzer:innen zugänglich gemacht wird.
