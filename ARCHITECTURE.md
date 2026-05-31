# HinSchG — System-Architektur

**Open-Source-Hinweisgeber- & Compliance-Plattform (HinSchG / EU-RL 2019/1937)**
Repo-/Arbeitsname: *HinSchG* · Lizenz: AGPLv3 · GitHub: `BEKO2210/HinSchG`

---

## 1. Leitprinzipien (nicht verhandelbar)

1. **Datenminimierung als Default.** Es wird keine Identität, keine E-Mail, keine IP des Hinweisgebers gespeichert. Was nicht existiert, kann nicht geleakt oder erzwungen werden.
2. **Der Betreiber ist Teil des Bedrohungsmodells.** Bei Self-Hosting hostet die Organisation selbst — also genau die Stelle, gegen die sich eine Meldung richten könnte. Das Design muss verhindern, dass ein DB-Admin Hinweisgeber de-anonymisiert.
3. **Zugang über Token, nicht über Accounts.** Der Hinweisgeber bekommt einen einmaligen Receipt-Code. Dieser ist der einzige Schlüssel zu seinem anonymen Postfach.
4. **Ehrliche Sicherheitsstufen.** Wir vermarkten erst dann „Ende-zu-Ende" / „Zero-Knowledge", wenn Stufe 2 (siehe §5) steht und extern auditiert ist. Im MVP wird klar „verschlüsselt at rest + datenminimiert" kommuniziert.
5. **Compliance ist ein Feature, kein Marketing.** Fristen (7 Tage / 3 Monate), Audit-Trail und revisionssichere Doku sind im Kern verankert.

---

## 2. Komponenten-Überblick

```
┌─────────────────────────────────────────────────────────────┐
│                        HinSchG-Instanz                        │
│                                                               │
│  [Public Web]                    [Admin / Meldestelle]        │
│  ┌──────────────┐                ┌──────────────────────┐     │
│  │ Meldeformular │                │ Bearbeiter-Login      │     │
│  │ Postfach      │                │ (Argon2id + TOTP 2FA) │     │
│  │ (Token-Zugang)│                │ Case-Dashboard        │     │
│  └──────┬───────┘                └──────────┬───────────┘     │
│         │                                    │                 │
│         └──────────────┬─────────────────────┘                 │
│                        ▼                                        │
│              ┌───────────────────┐                             │
│              │  Next.js API Layer │                             │
│              │  (App Router)      │                             │
│              └─────────┬─────────┘                             │
│                        ▼                                        │
│        ┌──────────────────────────────┐                       │
│        │ PostgreSQL                     │                       │
│        │ - cases (ciphertext)           │                       │
│        │ - case_messages (ciphertext)   │                       │
│        │ - handlers (keys, 2FA)         │                       │
│        │ - audit_log                    │                       │
│        └──────────────────────────────┘                       │
│                                                                 │
│  Optional Sidecar: Tor Onion Service (anonymer Zugang)         │
└─────────────────────────────────────────────────────────────┘
         ▲                                    ▲
         │ TLS / .onion                       │ TLS
   Hinweisgeber                          Meldestelle
```

**Tech-Stack:**

| Schicht | Technologie | Begründung |
|---|---|---|
| Frontend + API | Next.js 14 (App Router) + TypeScript | Ein Repo, SSR + API Routes, gut mit Claude Code baubar |
| Styling | Tailwind CSS | Minimalistisch, schnell, konsistent |
| DB | PostgreSQL 16 | Robust, Standard, self-hostbar |
| ORM | Prisma | Typsicheres Schema + Migrations |
| Krypto | libsodium-wrappers / `@noble/ciphers` | Auditierte Primitive, kein Eigenbau |
| Passwort-Hash | Argon2id (`argon2`) | State of the art gegen Brute Force |
| 2FA | TOTP (`otplib`) | Standard, kompatibel mit Authenticator-Apps |
| Deploy | Docker Compose | „10-Minuten-Self-host" |
| Anonymität (optional) | Tor Onion Service (Sidecar) | Schutz auch auf Netzwerkebene |

---

## 3. Bedrohungsmodell

Wer sind die Angreifer, und wie schützt das Design?

| # | Angreifer | Ziel des Angreifers | Gegenmaßnahme |
|---|---|---|---|
| T1 | **Betreiber / DB-Admin der Organisation** | Hinweisgeber de-anonymisieren über DB-Inhalte | Keine PII erfasst; kein IP-Log; Token nur als Hash gespeichert; Stufe-2-E2E entzieht dem Server den Klartext vollständig |
| T2 | **Netzwerk-Angreifer (MITM)** | Meldung im Transit abfangen | TLS erzwungen (HSTS); optional Tor Onion Service |
| T3 | **Server-Kompromittierung** | DB / Festplatte auslesen | Verschlüsselung at rest; minimale Metadaten; Secrets außerhalb der DB |
| T4 | **Bösartiger Insider in der Meldestelle** | Fälle manipulieren / löschen / einsehen ohne Befugnis | Rollentrennung; lückenloser Audit-Trail (append-only); 4-Augen-Option |
| T5 | **Korrelations-/Metadaten-Angriff** | Über Timing/Zugriffsmuster Identität ableiten | Keine Zeitstempel-Genauigkeit über das Nötige hinaus; keine Referrer; optionale Verzögerung der Eingangsbestätigung |
| T6 | **Erzwungene Herausgabe (Behörde/Gericht beim Betreiber)** | Identität herausverlangen | Was nicht existiert, kann nicht herausgegeben werden — Datenminimierung ist der Schutz |
| T7 | **Brute Force auf Receipt-Token** | Fremdes Postfach öffnen | Token mit hoher Entropie (≥128 Bit); Rate Limiting; Token nur als Argon2id-Hash gespeichert |

**Wichtigste Designkonsequenz aus T1/T6:** Der Hinweisgeber-Identitätsschutz beruht primär auf *Nicht-Erhebung*, nicht nur auf Verschlüsselung. Das Formular fragt niemals zwingend nach Name/Kontakt. Optionale Kontaktangaben (falls der Hinweisgeber sie freiwillig macht) werden behandelt wie der Meldungsinhalt: verschlüsselt, minimiert.

---

## 4. Datenmodell (PostgreSQL / Prisma)

```prisma
// Meldestelle / Mandant (MVP: ein Eintrag; später Multi-Tenant)
model ReportingOffice {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  createdAt   DateTime @default(now())
  handlers    Handler[]
  cases       Case[]
}

// Bearbeiter der Meldestelle
model Handler {
  id                 String   @id @default(cuid())
  officeId           String
  office             ReportingOffice @relation(fields: [officeId], references: [id])
  email              String   @unique
  passwordHash       String   // Argon2id
  totpSecret         String?  // verschlüsselt gespeichert
  publicKey          String?  // für Stufe-2-E2E
  encryptedPrivateKey String? // privater Key, mit Passwort-abgeleitetem Key verschlüsselt
  role               HandlerRole @default(HANDLER)
  createdAt          DateTime @default(now())
}

enum HandlerRole {
  ADMIN     // Verwaltung, kann Bearbeiter anlegen
  HANDLER   // Fallbearbeitung
  AUDITOR   // nur Lesezugriff auf Audit-Log
}

// Meldung / Fall
model Case {
  id              String   @id @default(cuid())
  officeId        String
  office          ReportingOffice @relation(fields: [officeId], references: [id])
  tokenHash       String   @unique  // Argon2id-Hash des Receipt-Tokens, NIE Klartext
  category        String?
  severity        Severity @default(UNSET)
  status          CaseStatus @default(NEW)
  encryptedPayload String  // verschlüsselter Meldungsinhalt
  deadlineAck     DateTime // Eingangsbestätigung: +7 Tage (HinSchG)
  deadlineFeedback DateTime // Rückmeldung Folgemaßnahmen: +3 Monate (HinSchG)
  acknowledgedAt  DateTime?
  feedbackSentAt  DateTime?
  createdAt       DateTime @default(now())
  messages        CaseMessage[]
  attachments     CaseAttachment[]
  statusHistory   CaseStatusHistory[]
}

enum Severity { UNSET LOW MEDIUM HIGH CRITICAL }
enum CaseStatus { NEW IN_REVIEW INFO_REQUESTED ACTION_TAKEN CLOSED REJECTED }

// Zwei-Wege-Kommunikation (anonym, über Token)
model CaseMessage {
  id            String   @id @default(cuid())
  caseId        String
  case          Case     @relation(fields: [caseId], references: [id])
  direction     MsgDirection
  encryptedBody String
  createdAt     DateTime @default(now())
}

enum MsgDirection { FROM_WHISTLEBLOWER FROM_OFFICE }

model CaseAttachment {
  id               String   @id @default(cuid())
  caseId           String
  case             Case     @relation(fields: [caseId], references: [id])
  encryptedBlobRef String   // Pfad/Ref zum verschlüsselten Blob
  encryptedFilename String
  mimeType         String
  sizeBytes        Int
  createdAt        DateTime @default(now())
}

// Append-only Audit-Trail
model AuditLog {
  id        String   @id @default(cuid())
  actorType String   // "HANDLER" | "SYSTEM" | "WHISTLEBLOWER"
  actorId   String?
  action    String   // z.B. "CASE_VIEWED", "STATUS_CHANGED", "ACK_SENT"
  caseId    String?
  metadata  Json?    // keine PII
  createdAt DateTime @default(now())
}

model CaseStatusHistory {
  id        String   @id @default(cuid())
  caseId    String
  case      Case     @relation(fields: [caseId], references: [id])
  fromStatus CaseStatus?
  toStatus   CaseStatus
  changedBy  String   // handlerId
  createdAt  DateTime @default(now())
}
```

**Bewusst NICHT vorhanden:** IP-Adressen, User-Agent-Logs, Klartext-Token, Klartext-Meldungsinhalte, zwingende Hinweisgeber-Identität.

---

## 5. Krypto-Flow — zwei ehrliche Stufen

### Stufe 1 (MVP) — „Verschlüsselt at rest + datenminimiert"

So wird es im MVP gebaut und auch **genau so kommuniziert** — kein Over-Promising.

**Meldung einreichen:**
1. Hinweisgeber füllt Formular aus (kein Account, keine E-Mail-Pflicht).
2. Server generiert **Receipt-Token** (≥128 Bit Entropie, z. B. 24 Zeichen Base32, gruppiert wie `XXXX-XXXX-XXXX-XXXX`).
3. Server speichert nur `tokenHash = Argon2id(token)` — der Klartext-Token wird dem Hinweisgeber **einmalig** angezeigt und nie gespeichert.
4. Meldungsinhalt wird mit einem **Server-Master-Key** (aus Environment/Secret-Store, NICHT in der DB) per XChaCha20-Poly1305 verschlüsselt → `encryptedPayload`.
5. Fristen werden gesetzt: `deadlineAck = now + 7d`, `deadlineFeedback = now + 3 Monate`.

**Postfach öffnen / antworten:**
1. Hinweisgeber gibt Token ein → Server prüft gegen `tokenHash` (Argon2id verify), Rate-Limited.
2. Bei Treffer: Nachrichten werden serverseitig entschlüsselt und angezeigt.
3. Bearbeiter-Antworten ebenso verschlüsselt gespeichert.

> **Grenze von Stufe 1, klar benannt:** Der Server (und damit ein Betreiber mit DB- und Secret-Zugriff) kann technisch den Klartext lesen. Das ist akzeptabel für ein MVP/internes System, **aber** das Marketing darf hier nur „verschlüsselt, datenminimiert, kein PII" sagen — nicht „Zero-Knowledge".

### Stufe 2 (Trust-Grade) — echtes Ende-zu-Ende

Der Burggraben. Nach MVP, vor jeder „E2E"-Behauptung extern auditieren lassen.

1. Beim Onboarding generiert jeder Bearbeiter ein **X25519-Keypair** im Browser. Der private Key wird mit einem aus dem Passwort via Argon2id abgeleiteten Key verschlüsselt (`encryptedPrivateKey`) und liegt nur so auf dem Server. Public Keys liegen offen.
2. Beim Einreichen verschlüsselt der **Browser des Hinweisgebers** die Meldung mit den Public Keys aller berechtigten Bearbeiter (sealed box / crypto_box). Der Server sieht nur Ciphertext.
3. Für die Rückrichtung wird aus dem Receipt-Token ein symmetrischer Key abgeleitet; Bearbeiter verschlüsseln Antworten zusätzlich gegen diesen — nur wer das Token hat, liest sie.
4. Der Server kann zu keinem Zeitpunkt Klartext sehen → echtes Zero-Knowledge.

**Trade-off:** Verliert ein Bearbeiter sein Passwort, ist sein privater Key (und damit Fallzugang) weg → Recovery-Konzept nötig (z. B. Multi-Recipient-Verschlüsselung, sodass mehrere Bearbeiter denselben Fall lesen können, plus ein sicher verwahrter Org-Recovery-Key).

---

## 6. HinSchG-Compliance-Logik (im Kern verankert)

| Pflicht | Umsetzung im System |
|---|---|
| Eingangsbestätigung binnen **7 Tagen** | `deadlineAck`-Timer, Dashboard-Warnung, Audit-Eintrag bei Bestätigung |
| Rückmeldung über Folgemaßnahmen binnen **3 Monaten** | `deadlineFeedback`-Timer, eskalierende Warnungen |
| Anonyme Meldungen ermöglichen | Token-Zugang ohne Identität |
| Vertraulichkeit der Identität | Datenminimierung + Verschlüsselung |
| Dokumentations-/Aufbewahrungspflicht | Audit-Log (append-only), Status-Historie, definierte Löschfristen |
| Schutz vor Interessenkonflikt | Rollentrennung; Option, bestimmte Bearbeiter von Fällen auszuschließen |

> **Rechtlicher Hinweis:** Die Compliance-Aussagen müssen vor Produktivbetrieb von einer qualifizierten Rechtsvertretung geprüft werden. Das System *unterstützt* die Pflichterfüllung, ersetzt aber keine Rechtsberatung.

---

## 7. Roadmap

| Phase | Inhalt | Sicherheitsversprechen |
|---|---|---|
| MVP (P0–P7) | Formular, Token-Postfach, Bearbeiter-Auth, Dashboard, Fristen, Audit, Docker-Deploy | „verschlüsselt at rest, datenminimiert" |
| P8 | E2E-Krypto (Stufe 2), Tor Onion Service | „Zero-Knowledge" (nach Audit) |
| P9 | Multi-Tenant (Mandantenfähigkeit für Kanzleien/Berater) | — |
| P10 | Managed-Hosting-Layer, Billing, SSO | — |
| P11 | Meldestelle-as-a-Service (Operator-Workflows, Partner-Anwälte) | — |
