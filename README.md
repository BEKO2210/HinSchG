# HinSchG

**Open-Source-Hinweisgeber- & Compliance-Plattform** nach dem deutschen
Hinweisgeberschutzgesetz (HinSchG) und der EU-Whistleblower-Richtlinie
2019/1937.

> Status: **Phase 0 — Grundgeruest.** Meldestrecke, anonymes Postfach,
> Bearbeiter-Login und Dashboard folgen in den naechsten Phasen
> (siehe `ARCHITECTURE.md` und `HinSchG_BUILD_PROMPTS.md`).

---

## Was ist HinSchG?

HinSchG ist eine selbst-hostbare Plattform, mit der Organisationen die
gesetzlich vorgeschriebene **interne Meldestelle** betreiben koennen.
Hinweisgeber:innen koennen anonym Verstoesse melden und ueber ein
token-basiertes Postfach mit der Meldestelle kommunizieren — ohne Account,
ohne Pflicht zur Angabe ihrer Identitaet.

Leitprinzipien (Details in [`ARCHITECTURE.md`](./ARCHITECTURE.md)):

- **Datenminimierung als Default** — keine IP-, User-Agent- oder
  Identitaetsspeicherung. Was nicht existiert, kann nicht geleakt werden.
- **Der Betreiber ist Teil des Bedrohungsmodells** — das Design erschwert,
  dass selbst ein DB-Admin Hinweisgeber de-anonymisiert.
- **Zugang ueber Token statt Accounts** — ein hochentropischer Receipt-Code
  ist der einzige Schluessel zum anonymen Postfach.
- **Compliance im Kern** — Fristen (7 Tage Eingangsbestaetigung, 3 Monate
  Rueckmeldung), Audit-Trail und revisionssichere Doku.

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
PostgreSQL-Datenbank laeuft im Service `db` (Healthcheck inklusive).
Zum Stoppen: `docker compose down` (Daten bleiben im Volume `postgres_data`
erhalten; `docker compose down -v` loescht auch die Daten).

### Lokale Entwicklung (ohne Docker)

```bash
npm install
cp .env.example .env          # DATABASE_URL auf localhost anpassen
npm run prisma:validate       # Phase 0: Schema validieren (Modelle folgen in Phase 1)
npm run dev                   # http://localhost:3000
```

Nuetzliche Skripte:

| Befehl                    | Zweck                                 |
| ------------------------- | ------------------------------------- |
| `npm run dev`             | Entwicklungsserver                    |
| `npm run build`           | Produktions-Build                     |
| `npm run lint`            | ESLint                                |
| `npm run typecheck`       | TypeScript-Pruefung (strict)          |
| `npm run format`          | Prettier (schreibend)                 |
| `npm run prisma:validate` | Prisma-Schema validieren              |
| `npm run prisma:migrate`  | Migration in der Entwicklung anwenden |

---

## Sicherheits-Disclaimer

> **Aktuelle Sicherheitsstufe: Stufe 1 — „verschluesselt at rest + datenminimiert".**
>
> Meldungsinhalte werden symmetrisch (XChaCha20-Poly1305) mit einem
> Server-Master-Key verschluesselt gespeichert, und es werden bewusst keine
> personenbezogenen Metadaten (IP, User-Agent, Pflicht-Identitaet) erhoben.
>
> **Dies ist NICHT Zero-Knowledge / Ende-zu-Ende-Verschluesselung.** Ein
> Betreiber mit Zugriff auf Datenbank **und** Master-Key kann technisch den
> Klartext lesen. Die echte Ende-zu-Ende-Verschluesselung (Stufe 2) ist als
> spaetere Phase geplant und wird erst nach einem **externen
> Security-Audit** als „Zero-Knowledge" kommuniziert.
>
> **Rechtlicher Hinweis:** Das System _unterstuetzt_ die Erfuellung der
> HinSchG-Pflichten, ersetzt aber keine Rechtsberatung. Compliance-Aussagen
> sind vor Produktivbetrieb von einer qualifizierten Rechtsvertretung zu
> pruefen.

---

## Lizenz

Lizenziert unter der **GNU Affero General Public License v3.0 or later
(AGPL-3.0-or-later)** — siehe [`LICENSE`](./LICENSE).

Die AGPLv3 verlangt insbesondere, dass auch bei Bereitstellung der Software
als Netzwerkdienst der vollstaendige Quellcode (inkl. Aenderungen) den
Nutzer:innen zugaenglich gemacht wird.
