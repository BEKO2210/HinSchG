# HinSchG — Build-Prompts für Claude Code on the web

Open-Source-Hinweisgeber- & Compliance-Plattform · GitHub: `BEKO2210/HinSchG` · Lizenz: AGPLv3

---

## So läuft der Web-Workflow (anders als CLI)

Claude Code on the web läuft auf `claude.ai/code` in einer von Anthropic verwalteten, isolierten Cloud-VM. Du wählst ein GitHub-Repo, beschreibst eine Aufgabe, Claude arbeitet eigenständig und legt das Ergebnis als **Pull Request** in einem neuen Branch ab. Wichtig zu wissen:

- **Nur GitHub** wird unterstützt (kein GitLab).
- **Jede Aufgabe = ein eigener PR.** Du reviewst, mergst, gibst die nächste Aufgabe.
- **Netzwerkzugriff ist standardmäßig eingeschränkt.** Für Phasen mit `npm install` / DB-Setup musst du im Session-Setup **Netzwerkzugriff erlauben**.
- **Kontext lebt in `CLAUDE.md`** im Repo-Root — die liest Claude bei jeder Session automatisch. Deshalb ersetzt die `CLAUDE.md` (siehe §0) den früheren „Kontext-Block"; du musst ihn nicht mehr pro Session einfügen.
- Sessions laufen weiter, auch wenn du den Browser schließt; du kannst sie aus der Claude-Mobile-App beobachten.

### Einrichtung (einmalig)

1. **Leeres GitHub-Repo anlegen:** `BEKO2210/HinSchG` (Public, mit README initialisieren).
2. **Zwei Dateien ins Repo-Root legen** (über die GitHub-Weboberfläche → „Add file"):
   - `CLAUDE.md` → Inhalt aus §0 dieser Datei
   - `ARCHITECTURE.md` → die Architektur-Datei
3. **`claude.ai/code` öffnen**, GitHub verbinden, Repo `HinSchG` auswählen.
4. **Netzwerkzugriff in den Session-Einstellungen aktivieren** (für Installation/Migrations).
5. Phasen-Aufgaben (§1 ff.) **eine nach der anderen** als Task starten.

### Pro Phase

1. Aufgabentext aus dieser Datei als neue Task einfügen.
2. Claude arbeitet → erstellt PR.
3. PR **reviewen** (Diff durchsehen, Akzeptanzkriterien prüfen) → **mergen**.
4. Erst danach die nächste Phase starten (sie baut auf dem gemergten Stand auf).

> Da der Kontext in `CLAUDE.md` liegt, können die Task-Beschreibungen kurz bleiben — der Inhalt unten ist bewusst vollständig, du kannst ihn aber 1:1 als Task verwenden.

---

## §0 — Datei `CLAUDE.md` (ins Repo-Root legen)

```markdown
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
```

---

## Phase 0 — Repo-Scaffold & Infrastruktur

> Netzwerkzugriff für diese Session aktivieren.

```
Aufgabe: Projekt-Scaffold fuer HinSchG anlegen.

Erstelle das vollstaendige Grundgeruest:
1. Next.js 14 (App Router) + TypeScript (strict) + Tailwind CSS, sauber konfiguriert.
2. Prisma initialisiert mit PostgreSQL als Provider, leeres Schema (Tabellen folgen in Phase 1).
3. ESLint + Prettier.
4. docker-compose.yml mit Services "app" (Next.js) und "db" (postgres:16),
   inkl. Healthcheck und Volume fuer Postgres. .env.example mit allen noetigen Variablen
   (DATABASE_URL, MASTER_ENCRYPTION_KEY, SESSION_SECRET).
5. Dockerfile fuer die App (multi-stage build).
6. README.md: Projektbeschreibung "Was ist HinSchG", Self-host-Quickstart (docker compose up),
   Hinweis auf AGPLv3, Sicherheits-Disclaimer (aktuell Stufe-1-Krypto, kein Zero-Knowledge).
7. LICENSE mit vollstaendigem AGPLv3-Text.
8. .gitignore (node, next, env, prisma).
9. GitHub Actions CI (.github/workflows/ci.yml): install, lint, typecheck, build, prisma validate.
10. Ordnerstruktur: /src/app, /src/lib (crypto, db, auth), /src/components.

Akzeptanzkriterien:
- "docker compose up" startet App + DB ohne Fehler.
- "npm run lint" und "npm run build" laufen sauber.
- README erklaert den Quickstart in unter 10 Minuten.

Fasse in der PR-Beschreibung alle erstellten Dateien zusammen.
```

---

## Phase 1 — Datenmodell & Migrations

> Netzwerkzugriff aktivieren.

```
Aufgabe: Datenmodell gemaess ARCHITECTURE.md Abschnitt 4 implementieren.

1. Vollstaendiges Prisma-Schema: ReportingOffice, Handler, Case, CaseMessage,
   CaseAttachment, AuditLog, CaseStatusHistory inkl. aller Enums.
2. Initiale Migration + Seed-Skript: eine Demo-ReportingOffice und einen Admin-Handler
   (Passwort aus ENV, Argon2id-gehasht).
3. /src/lib/db.ts: Prisma-Client-Singleton.
4. /src/lib/crypto.ts (Stufe 1) mit Unit-Tests:
   - generateReceiptToken(): >=128 Bit Entropie, Format XXXX-XXXX-XXXX-XXXX
   - hashToken / verifyToken: Argon2id
   - encryptPayload / decryptPayload: XChaCha20-Poly1305 mit MASTER_ENCRYPTION_KEY aus ENV
   - hashPassword / verifyPassword: Argon2id

Akzeptanzkriterien:
- "npx prisma migrate dev" + Seed laufen durch.
- crypto-Tests gruen (encrypt->decrypt = Original; falscher Token verifiziert nicht).
- Keine Klartext-Tokens oder PII im Schema.
```

---

## Phase 2 — Öffentliches Meldeformular

```
Aufgabe: Oeffentliche Meldestrecke (kein Login).

1. Seite /melden: minimalistisches Formular. Felder: Kategorie (Dropdown),
   Beschreibung (Pflicht), optionaler Vorfallszeitpunkt, optionale FREIWILLIGE
   Kontaktmoeglichkeit. KEINE Pflicht-Identitaetsfelder.
2. API POST /api/cases:
   - Receipt-Token generieren, nur Argon2id-Hash speichern
   - gesamten Meldungsinhalt verschluesseln (encryptPayload)
   - deadlineAck (+7 Tage), deadlineFeedback (+3 Monate) setzen
   - AuditLog "CASE_CREATED" (ohne PII)
   - KEINE IP, KEIN User-Agent speichern
3. Bestaetigungsseite: Receipt-Token EINMALIG gross + kopierbar anzeigen, mit Hinweis
   "Code sicher aufbewahren - einziger Zugang zum Postfach, nicht wiederherstellbar."
4. Rate Limiting auf der API-Route.

WICHTIG: Klartext-Token nach Anzeige nirgends persistieren (keine Logs, keine DB).

Akzeptanzkriterien:
- Absenden -> Token-Anzeige -> Case liegt verschluesselt in der DB.
- DB enthaelt nur tokenHash, Logs keine Inhalte/Tokens.
```

---

## Phase 3 — Hinweisgeber-Postfach (Zwei-Wege-Kommunikation)

```
Aufgabe: Anonymes Postfach.

1. Seite /postfach: Eingabe des Receipt-Tokens.
2. API POST /api/inbox/auth: Token gegen tokenHash pruefen (Argon2id verify),
   Rate-Limited + exponentielles Backoff. Bei Erfolg kurzlebige, an den Case gebundene
   Session (httpOnly-Cookie), KEIN persistenter Account.
3. Postfach-Ansicht: Fallstatus, ob Eingangsbestaetigung erfolgt ist, Nachrichtenverlauf
   (entschluesselt) zwischen Hinweisgeber und Meldestelle.
4. Antworten -> CaseMessage direction=FROM_WHISTLEBLOWER, verschluesselt. AuditLog "WB_MESSAGE_ADDED".

Akzeptanzkriterien:
- Richtiger Token oeffnet richtiges Postfach, falscher wird abgewiesen.
- Nachrichten verschluesselt gespeichert, korrekt angezeigt.
- Session laeuft ab, kein dauerhafter Login.
```

---

## Phase 4 — Bearbeiter-Authentifizierung (Argon2id + TOTP 2FA)

```
Aufgabe: Login der Meldestellen-Bearbeiter.

1. /admin/login: E-Mail + Passwort, danach TOTP-Code (2FA Pflicht).
2. Auth-Flow: Argon2id-Passwortpruefung, dann TOTP via otplib. Sichere Session
   (httpOnly, secure, sameSite=strict).
3. Erstmaliges TOTP-Setup mit QR-Code; Secret verschluesselt speichern.
4. Rollen-Middleware ADMIN/HANDLER/AUDITOR; /admin nur fuer Berechtigte (serverseitig erzwungen).
5. ADMIN kann weitere Handler anlegen.
6. AuditLog: LOGIN_SUCCESS, LOGIN_FAILED, 2FA_FAILED.

Akzeptanzkriterien:
- Login ohne korrekten 2FA-Code schlaegt fehl.
- Rollen serverseitig durchgesetzt (nicht nur UI).
- Fehlversuche rate-limited + im Audit-Log.
```

---

## Phase 5 — Case-Management-Dashboard

```
Aufgabe: Dashboard fuer die Meldestelle.

1. /admin: Fall-Liste mit Status, Kategorie, Schweregrad, Eingangsdatum und FRISTEN-AMPEL
   (gruen/gelb/rot) fuer deadlineAck (7 Tage) und deadlineFeedback (3 Monate);
   Faelliges/Ueberfaelliges oben.
2. /admin/cases/[id]: entschluesselter Inhalt; Nachrichtenverlauf + Antwort
   (CaseMessage FROM_OFFICE, verschluesselt); Button "Eingang bestaetigen"
   (setzt acknowledgedAt + Audit + Nachricht an WB); Status aendern (CaseStatusHistory);
   Schweregrad setzen.
3. Jede Lese-/Schreibaktion -> AuditLog (CASE_VIEWED, STATUS_CHANGED, ACK_SENT, OFFICE_MESSAGE_ADDED).

Akzeptanzkriterien:
- Fristen-Ampel rechnet korrekt, Ueberfaelliges hervorgehoben.
- Antwort der Meldestelle erscheint im Hinweisgeber-Postfach.
- Jeder Fallzugriff im Audit-Log nachvollziehbar.
```

---

## Phase 6 — Audit-Trail & Härtung

```
Aufgabe: Audit-Ansicht + Sicherheits-Haertung.

1. /admin/audit (ADMIN/AUDITOR): durchsuchbare, append-only Ansicht; Eintraege nicht
   loesch-/editierbar ueber UI oder API.
2. Security-Header global: HSTS, strikte CSP, X-Content-Type-Options,
   Referrer-Policy=no-referrer, Permissions-Policy.
3. Code-Review aller Logging-Aufrufe: kein PII, kein Token, kein Meldungsinhalt im Log.
4. Konfigurierbare Loeschfristen fuer geschlossene Faelle.
5. Globales Rate Limiting / Abuse-Schutz.

Akzeptanzkriterien:
- Audit-Log nachweislich append-only.
- Security-Header via "curl -I" sichtbar.
- Kein PII/Token in Logs.
```

---

## Phase 7 — Deployment & Self-host-Doku

> Netzwerkzugriff aktivieren.

```
Aufgabe: Produktionsreifes Self-Hosting.

1. docker-compose.prod.yml: App + Postgres + Reverse Proxy (Caddy/Traefik) mit
   automatischem TLS; Health-Checks, Restart-Policies, Backup-Hinweis.
2. Make-Targets: "make setup", "make up", "make migrate", "make seed".
3. docs/SELFHOSTING.md: Voraussetzungen, Schritt-fuer-Schritt-Deploy auf Linux-Server,
   Secret-Generierung (MASTER_ENCRYPTION_KEY etc.), Backup-/Update-Prozedur,
   klarer Disclaimer: aktuell Stufe-1-Krypto (verschluesselt at rest, datenminimiert),
   NICHT Zero-Knowledge.
4. Klare Landing Page auf "/" mit Beschreibung + Links zu /melden und /postfach.

Akzeptanzkriterien:
- Frischer Server -> via Doku in <30 Min live mit HTTPS.
- Secrets generiert, nicht hartkodiert.
- Disclaimer eindeutig und korrekt.
```

---

## Danach (nicht im MVP)

- **Phase 8 — E2E-Krypto (Stufe 2)** + Tor Onion Service. „Zero-Knowledge" erst nach externem Security-Audit kommunizieren.
- **Phase 9 — Multi-Tenant** für Kanzleien/Berater mit mehreren Mandanten.
- **Phase 10 — Managed-Hosting-Layer** + Billing + SSO.
- **Phase 11 — Meldestelle-as-a-Service** (Operator-Workflows, Partner-Anwälte).

---

## Web-spezifische Tipps

- **Parallelisierung:** Unabhängige Aufgaben (z. B. eine Landing-Page-Verbesserung) kannst du parallel als eigene Task laufen lassen. Voneinander abhängige Phasen (0→1→2…) strikt sequenziell mergen.
- **Netzwerk nur wenn nötig:** Für reine Frontend-/Logik-Phasen Netzwerk aus lassen (sicherer); für Install/Migration an.
- **Review ist Pflicht:** Bei einer Sicherheits-App jeden PR ernsthaft durchsehen — besonders Krypto, Auth, Logging. Nicht blind mergen.
- **Von Web zu lokal wechseln:** Für finale Reviews oder sensible Krypto-Arbeit kannst du eine Session lokal in der CLI weiterführen (gleicher claude.ai-Account).

## Qualitäts-Checkliste vor dem ersten öffentlichen Release

- [ ] Kein PII/Token/Klartext in Logs (gegengeprüft)
- [ ] Receipt-Token nur als Argon2id-Hash gespeichert
- [ ] 2FA für Bearbeiter erzwungen
- [ ] Audit-Log append-only, nicht manipulierbar
- [ ] Security-Header gesetzt (CSP, HSTS, no-referrer)
- [ ] Rate Limiting auf allen öffentlichen Endpunkten
- [ ] Sicherheits-Disclaimer korrekt (Stufe 1, nicht „E2E")
- [ ] Compliance-Aussagen rechtlich geprüft
- [ ] AGPLv3 korrekt eingebunden
- [ ] `docker compose up` funktioniert auf frischem System
