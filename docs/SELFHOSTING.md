# HinSchG — Self-Hosting (Produktion)

Diese Anleitung bringt HinSchG auf einem frischen Linux-Server in unter
30 Minuten produktiv ans Netz — mit automatischem HTTPS.

---

## 1. Voraussetzungen

- Ein Linux-Server (z. B. Debian/Ubuntu) mit öffentlicher IPv4-Adresse.
- **Docker** und **Docker Compose** (Plugin) installiert.
- **`make`** und **`openssl`** (auf den meisten Systemen vorhanden).
- Eine **Domain**, deren DNS-`A`-Record (und ggf. `AAAA`) auf den Server zeigt.
- Offene Ports **80** und **443** (für TLS-Ausstellung und Betrieb).

> Caddy holt die TLS-Zertifikate automatisch von Let's Encrypt. Dafür muss die
> Domain bereits auf den Server zeigen, bevor Sie starten.

---

## 2. Repository holen

```bash
git clone https://github.com/BEKO2210/HinSchG.git
cd HinSchG
```

---

## 3. Secrets erzeugen

```bash
make setup
```

Das erstellt eine `.env` mit **frisch generierten** Secrets:

- `MASTER_ENCRYPTION_KEY` (32 Byte) — verschlüsselt die Inhalte at rest.
- `SESSION_SECRET` (48 Byte) — signiert die Sessions.
- `POSTGRES_PASSWORD` — zufällig; auch in `DATABASE_URL` eingetragen.

Anschließend in der `.env` **`DOMAIN`** und **`ACME_EMAIL`** auf Ihre Werte
setzen:

```dotenv
DOMAIN=meldungen.ihre-organisation.de
ACME_EMAIL=it@ihre-organisation.de
```

> **Wichtig:** Sichern Sie den `MASTER_ENCRYPTION_KEY` zusätzlich an einem
> sicheren Ort (Passwort-Manager / Secret-Store). Geht er verloren, sind die
> verschlüsselten Meldungen **nicht wiederherstellbar**. Er liegt bewusst NICHT
> in der Datenbank.

---

## 4. Starten

```bash
make up
```

Das baut die Images, startet PostgreSQL, wendet die Datenbank-Migrationen an
(Service `migrate`) und startet App + Caddy. Beim ersten Start kann die
TLS-Ausstellung einige Sekunden dauern.

Status prüfen:

```bash
make ps
make logs
```

---

## 5. Meldestelle einrichten (Admin anlegen)

Einmalig einen Admin-Bearbeiter anlegen. Das Passwort kommt aus der Umgebung
und wird Argon2id-gehasht gespeichert:

```bash
SEED_ADMIN_PASSWORD="$(openssl rand -base64 18)" make seed
```

Notieren Sie das ausgegebene Passwort sicher. Danach:

1. `https://IHRE-DOMAIN/admin/login` öffnen.
2. Mit der Admin-E-Mail (Standard `admin@example.org`, via `SEED_ADMIN_EMAIL`
   änderbar) und dem Passwort anmelden.
3. Beim ersten Login **2FA (TOTP)** per QR-Code einrichten — ab dann Pflicht.
4. Unter **Bearbeiter** weitere Konten (HANDLER/AUDITOR) anlegen.

Hinweisgeber:innen nutzen `https://IHRE-DOMAIN/melden` und
`https://IHRE-DOMAIN/postfach`.

---

## 6. Backup

Das Postgres-Volume enthält alle (verschlüsselten) Daten. Regelmäßig sichern:

```bash
make backup        # schreibt backup_<timestamp>.sql
```

Für ein vollständiges Restore werden **beides** benötigt: das DB-Backup **und**
der `MASTER_ENCRYPTION_KEY`. Bewahren Sie beide getrennt auf.

Optional: Löschfristen für geschlossene Fälle aktivieren (in `.env`):

```dotenv
CASE_RETENTION_DAYS=365
```

und regelmäßig (z. B. per Cron) ausführen:

```bash
docker compose -f docker-compose.prod.yml run --rm migrate npm run purge:cases
```

---

## 7. Update

```bash
git pull
make up        # baut neu und startet; Migrationen laufen automatisch
```

---

## 8. Tor Onion Service (optional)

Für anonymen Zugang auch auf Netzwerkebene enthält `docker-compose.prod.yml`
einen optionalen **Tor-Onion-Service**. Er wird mit `make up` automatisch
gestartet. Die `.onion`-Adresse anzeigen:

```bash
docker compose -f docker-compose.prod.yml exec tor cat /var/lib/tor/hidden_service/hostname
```

Diese Adresse können Sie Hinweisgeber:innen zusätzlich zur Domain bekanntgeben.
Der Onion-Dienst leitet direkt auf die App; über `.onion` wird die CSP-Regel
`upgrade-insecure-requests` automatisch weggelassen (Tor nutzt kein HTTPS).
Den Schlüssel des Onion-Dienstes (Volume `tor_data`) sichern, damit die Adresse
erhalten bleibt.

---

## 9. Sicherheits-Disclaimer (bitte lesen)

> **Aktuelle Sicherheitsstufe: Stufe 1 — „verschlüsselt at rest + datenminimiert".**
>
> - Inhalte werden symmetrisch (XChaCha20-Poly1305) mit dem
>   `MASTER_ENCRYPTION_KEY` verschlüsselt gespeichert.
> - Es werden **keine** IP-Adressen, User-Agents oder Pflicht-Identitäten der
>   Hinweisgeber:innen gespeichert. Receipt-Tokens liegen nur als Argon2id-Hash
>   vor.
>
> **Dies ist NICHT Zero-Knowledge / Ende-zu-Ende-Verschlüsselung.** Wer Zugriff
> auf Datenbank **und** `MASTER_ENCRYPTION_KEY` hat, kann die Inhalte technisch
> lesen. Echte E2E-Verschlüsselung (Stufe 2) ist als spätere Phase geplant und
> wird erst nach einem **externen Security-Audit** als „Zero-Knowledge"
> kommuniziert.
>
> **Rechtlicher Hinweis:** Das System unterstützt die Erfüllung der
> HinSchG-Pflichten, ersetzt aber keine Rechtsberatung. Compliance-Aussagen sind
> vor Produktivbetrieb juristisch zu prüfen.
