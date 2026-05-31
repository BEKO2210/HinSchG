# HinSchG — Sicherheitsmodell, internes Review & Audit-Vorbereitung

Dieses Dokument beschreibt präzise die eingesetzte Kryptografie, den
Schlüsselfluss, das Bedrohungsmodell, die Befunde eines **internen**
Sicherheits-Reviews sowie den **Scope für ein externes Audit**.

> **Wichtig:** Das interne Review ersetzt **kein** externes Audit. „Zero-Knowledge"
> wird erst nach einem unabhängigen externen Security-Audit kommuniziert.

---

## 1. Eingesetzte Primitive & Parameter

| Zweck                                         | Primitive                                                             | Bibliothek       | Parameter                                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------ |
| Inhalte at rest (Stufe 1)                     | XChaCha20-Poly1305                                                    | `@noble/ciphers` | 24-Byte-Nonce vorangestellt, Schlüssel = `MASTER_ENCRYPTION_KEY` (32 B, Base64, ENV)                   |
| Passwörter & Receipt-Token (Stufe 1)          | Argon2id                                                              | `@noble/hashes`  | m = 19456 KiB, t = 2, p = 1, 32 B; PHC-Format mit Salt                                                 |
| Token-Blind-Index (Stufe 1)                   | HMAC-SHA256                                                           | `@noble/hashes`  | Schlüssel via HKDF-SHA256 aus `MASTER_ENCRYPTION_KEY`, Domain `hinschg/token-blind-index/v1`           |
| Sessions                                      | HMAC-SHA256 (signiertes Cookie)                                       | `node:crypto`    | `SESSION_SECRET`; httpOnly, secure (prod), SameSite=strict; Inbox 30 min, Admin 60 min, Pre-Auth 5 min |
| 2FA                                           | TOTP                                                                  | `otplib`         | Standard, Fenster ±1; Secret via Stufe-1 verschlüsselt                                                 |
| Schlüsselpaare (Stufe 2)                      | X25519 (crypto_box)                                                   | libsodium-sumo   | —                                                                                                      |
| Anonyme Verschlüsselung (Stufe 2)             | Sealed Box (`crypto_box_seal`)                                        | libsodium-sumo   | —                                                                                                      |
| Inhalts-/Nachrichtenverschlüsselung (Stufe 2) | `crypto_secretbox` (XSalsa20-Poly1305) + Sealed-Box-Wrap je Empfänger | libsodium-sumo   | zufälliger 32-B-Inhaltsschlüssel                                                                       |
| Privater Schlüssel at rest (Stufe 2)          | `crypto_secretbox` mit `crypto_pwhash` (Argon2id)                     | libsodium-sumo   | OPSLIMIT/ MEMLIMIT = MODERATE (≈256 MiB)                                                               |
| Token-abgeleitetes WB-Keypaar (Stufe 2)       | `crypto_generichash` → `crypto_box_seed_keypair`                      | libsodium-sumo   | Domain `hinschg/wb-keypair/v2`                                                                         |
| Token-Lookup/-Verify (Stufe 2)                | `crypto_generichash` (clientseitig)                                   | libsodium-sumo   | Domains `hinschg/token-lookup/v2`, `hinschg/token-verify/v2`                                           |

Receipt-Token: 160 Bit Entropie (20 Zufallsbytes, Base32, Format `XXXX-…` in 8
Vierergruppen).

---

## 2. Schlüssel- und Datenfluss

### Stufe 1 — „verschlüsselt at rest + datenminimiert" (Standard)

1. Meldung: Server erzeugt Receipt-Token → speichert **nur** `Argon2id(token)`
   (`tokenHash`) + Blind-Index (`tokenLookup`). Inhalt → XChaCha20-Poly1305 mit
   dem Master-Key. Klartext-Token wird einmalig angezeigt, nie gespeichert.
2. Postfach-Login: Blind-Index-Lookup → Argon2id-Verify.
3. Server kann Inhalte entschlüsseln (Master-Key) — bewusst, klar kommuniziert.

### Stufe 2 — Ende-zu-Ende (standardmäßig aktiv; `E2E_SUBMIT_ENABLED=false` schaltet ab)

- **Schlüssel:** Jede:r Bearbeiter:in erzeugt im Browser ein X25519-Keypaar; der
  private Schlüssel wird mit dem Passwort verschlüsselt (`encryptedPrivateKey`),
  der öffentliche liegt offen. Zusätzlich existiert ein **Org-Recovery-Keypaar**
  (privater Schlüssel mit separater Passphrase verschlüsselt).
- **Meldung einreichen (Browser des Hinweisgebers):** Token wird **im Browser**
  erzeugt; daraus wird deterministisch ein WB-Keypaar abgeleitet. Der Inhalt wird
  mit einem zufälligen Inhaltsschlüssel verschlüsselt; dieser wird per Sealed Box
  für **alle Bearbeiter-Public-Keys + Recovery + WB** verpackt (`CaseKey`). Der
  Server erhält nur Ciphertext, Wraps, `wbPublicKey` und clientseitig berechnete
  Lookups — **niemals** Token oder Klartext.
- **Lesen/Antworten:** Bearbeiter:in entsperrt den privaten Schlüssel im Browser
  (Passwort) und entschlüsselt; der Hinweisgeber leitet seinen Schlüssel erneut
  aus dem Token ab. Antworten werden wieder Multi-Recipient verschlüsselt
  (`CaseMessageKey`). Der Server entschlüsselt zu keinem Zeitpunkt.
- **Recovery:** Der Recovery-Public-Key ist immer Empfänger; mit der
  Recovery-Passphrase lassen sich Fälle prinzipiell wiederherstellen
  (Use-Flow: siehe Known Limitations).

---

## 3. Bedrohungsmodell (Kurzfassung, vgl. ARCHITECTURE.md §3)

| #        | Angreifer                    | Stufe 1                                   | Stufe 2                                           |
| -------- | ---------------------------- | ----------------------------------------- | ------------------------------------------------- |
| T1       | Betreiber / DB-Admin         | Keine PII; Inhalt mit Master-Key lesbar   | Inhalt **nicht** lesbar (kein privater Schlüssel) |
| T3       | Server-/DB-Kompromittierung  | Master-Key außerhalb der DB nötig         | Ciphertext nutzlos ohne Empfänger-Schlüssel       |
| T6       | Erzwungene Herausgabe        | Datenminimierung; Master-Key separat      | Server kann Klartext nicht herausgeben            |
| T7       | Brute-Force des Tokens       | ≥160 Bit, Rate-Limit, Backoff             | zusätzlich: Entschlüsselung nötig                 |
| T2/T4/T5 | MITM / Insider / Korrelation | TLS/HSTS, Rollen, Audit, Datenminimierung | unverändert                                       |

---

## 4. Befunde des internen Reviews

Schweregrad-Einschätzung ist **selbst** vergeben (kein externes Urteil).

| ID  | Schwere         | Befund                                                                                                                                     | Status / Maßnahme                                                                                                                                                                                                                             |
| --- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Info            | Stufe-2-Token-Lookup/-Verify sind **ungeschlüsselte** Hashes (kein Argon2id); weicht von der Formulierung „Token nur als Argon2id-Hash" ab | Akzeptiert: Token hat ≥160 Bit Entropie → nicht brute-forcebar; Token wird bei Stufe 2 nie an den Server gesendet; dokumentiert                                                                                                               |
| F2  | Niedrig         | WB-Token liegt während der Postfach-Sitzung im `sessionStorage` (XSS-Exposition)                                                           | Mitigiert durch strikte, nonce-basierte CSP; nur Tab-lokal; Alternativen im Audit prüfen                                                                                                                                                      |
| F3  | Niedrig         | In-Memory Rate-Limiting/Backoff sind **pro Instanz**                                                                                       | Für Multi-Instanz-Betrieb gemeinsamen Speicher (z. B. Redis) ergänzen; dokumentiert                                                                                                                                                           |
| F4  | Info            | CSP enthält `'wasm-unsafe-eval'` (für libsodium) und `style-src 'unsafe-inline'`                                                           | Notwendig bzw. geringes Risiko; Skripte weiterhin nonce-/`strict-dynamic`-geschützt                                                                                                                                                           |
| F5  | Mittel (Design) | Org-Recovery hatte zunächst keinen Use-Flow; Passwortverlust band den privaten Schlüssel                                                   | **Adressiert:** Recovery-Re-Wrap (`/api/admin/cases/[id]/recovery`) verpackt den Inhaltsschlüssel per Recovery-Passphrase im Browser neu und gewährt Bearbeiter:innen Zugriff. **Adressiert:** Schlüssel-Reset (`/api/admin/handlers/[id]/reset`, nur ADMIN) setzt ein neues Initialpasswort, verwirft das alte Keypaar; die Person richtet ein neues ein, danach Re-Wrap |
| F6  | Info            | Metadaten (Kategorie, Status, Fristen, Zeitstempel) sind auch bei Stufe 2 serverseitig sichtbar                                            | Bewusst (Dashboard/Compliance); dokumentiert                                                                                                                                                                                                  |
| F7  | Niedrig         | CSRF: keine separaten CSRF-Token                                                                                                           | Mitigiert durch `SameSite=strict`-Cookies + Same-Origin-`fetch`                                                                                                                                                                               |
| F8  | Info            | Stufe-1-Betreiber kann Inhalte lesen                                                                                                       | Bewusst; klar kommuniziert (kein Zero-Knowledge)                                                                                                                                                                                              |

Im Review **nicht** gefunden: Klartext-Token/PII/Inhalte in Logs oder
Audit-Metadaten; Klartext-Privatkeys in der DB; fehlende Rollendurchsetzung.

---

## 5. Known Limitations

- **Stufe 2 ist nicht extern auditiert** (standardmäßig aktiv, sobald
  eingerichtet; daher „Ende-zu-Ende", nicht „Zero-Knowledge").
- **Recovery-Re-Wrap vorhanden (F5):** Mit der Org-Recovery-Passphrase kann ein:e
  ADMIN den Fallzugriff für Bearbeiter:innen im Browser wiederherstellen (z. B.
  neu hinzugefügte Bearbeiter:innen).
- **Schlüssel-Reset vorhanden (F5):** Verliert ein:e Bearbeiter:in das Passwort,
  ist der daran gebundene private Schlüssel unbrauchbar. Ein:e ADMIN setzt über
  `/api/admin/handlers/[id]/reset` ein neues Initialpasswort und verwirft das alte
  Keypaar (`publicKey`/`encryptedPrivateKey` → `null`, Audit `HANDLER_RESET`). Die
  Person richtet beim nächsten Login ein neues Keypaar ein; den Zugriff auf
  bestehende E2E-Fälle stellt ein:e ADMIN anschließend per Recovery-Re-Wrap wieder
  her. Restrisiko: Gehen **alle** Bearbeiter-Schlüssel **und** die
  Recovery-Passphrase verloren, ist ein Fall nicht wiederherstellbar — daher
  Recovery-Passphrase sicher verwahren und mehrere Bearbeiter:innen einbinden.
- **Rate-Limiting** ist nicht instanzenübergreifend.
- **Mandantentrennung (Multi-Tenant, Phase 9a):** Jede Bearbeiter-Session ist an
  genau eine Meldestelle gebunden (`officeId` im signierten Cookie, `session.o`).
  Alle Admin-Lese-/Schreibzugriffe sind serverseitig auf diese `officeId`
  gescopt (Fälle, Bearbeiter:innen, Audit-Trail, E2E-/Recovery-Endpunkte). Ein
  direkter Zugriff auf eine fremde Fall-ID liefert 404 statt Daten. Signierte
  Alt-Sessions ohne `officeId` werden verworfen (Re-Login erzwungen). Belegt durch
  Unit-Tests (`session.test.ts`) und einen Browser-Cross-Tenant-Test
  (`e2e/flows.spec.ts`). **Offen (Phase 9b):** mandantenspezifisches öffentliches
  Routing (`/m/[slug]`) — derzeit nutzt die öffentliche Meldestrecke die
  Standard-Meldestelle.
- **Metadaten** sind nicht Ende-zu-Ende-verschlüsselt.
- **Anhänge** (CaseAttachment) sind im Datenmodell vorgesehen, aber noch nicht
  implementiert.

---

## 6. Scope-Empfehlung für ein externes Audit

**In-Scope:**

- Krypto-Implementierung & -Parameter: `src/lib/e2e.ts`, `src/lib/crypto.ts`,
  `src/lib/session.ts`.
- Stufe-2-Flows: `/api/cases` (v2), `/api/inbox/*`, `/api/admin/cases/[id]/*`,
  `src/components/{ReportForm,E2eCaseView,InboxE2eView,RecoveryKeySetup,KeyEnrollment}.tsx`.
- CSP/Header & Middleware (`src/middleware.ts`, `next.config.mjs`),
  Rate-Limiting/Backoff, Audit-Trail (Trigger).
- Schlüssel-Lebenszyklus: Erzeugung, Speicherung, Recovery-Konzept.

**Empfohlene Prüfschwerpunkte:** Korrektheit der Multi-Recipient-Konstruktion,
Nonce-/Schlüssel-Handhabung, Token-Ableitung, Session-Signatur, fehlende
Authentisierung der Wrap-Empfänger, XSS-/CSP-Wirksamkeit, Recovery-Vertrauensmodell.

**Out-of-Scope (derzeit):** Recovery-Use-Flow & Re-Wrap (noch nicht
implementiert), Anhänge, Multi-Tenant.

**Vorgehen:** unabhängige Prüfung durch eine spezialisierte Stelle
(z. B. Cure53, Radically Open Security, NCC Group) inkl. veröffentlichtem
Bericht; erst danach „Zero-Knowledge" kommunizieren.
