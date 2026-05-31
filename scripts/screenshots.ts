/* eslint-disable no-console */
// HinSchG — Reproduzierbare UI-Screenshots (headless Chromium)
//
// Erzeugt von JEDER UI-Seite des App-Routers einen Screenshot, ausschliesslich
// mit Demo-/Seed-Daten. Rechtlich heikel, daher strikt:
//   - KEINE echten/sensiblen Meldungsinhalte (nur neutrale Demo-Texte).
//   - Receipt-Token wird im DOM durch einen offensichtlichen Dummy ersetzt
//     (DEMO-XXXX-…), bevor ein Screenshot entsteht — der echte Token erscheint nie.
//   - Demo-Konten: admin@example.org / superadmin@example.org (Beispiel-Domain).
//
// Voraussetzung: laufende DB (DATABASE_URL), gebaute App. Das Skript startet die
// App selbst (`next start`), migriert, seedet und faehrt sie am Ende herunter.
//
// Aufruf: npm run screenshots

import { spawn, type ChildProcess } from 'node:child_process';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import { authenticator } from 'otplib';

const PORT = 3215;
const BASE = `http://localhost:${PORT}`;
const OUT = path.join(process.cwd(), 'docs', 'screenshots');

const ADMIN_EMAIL = 'admin@example.org';
const ADMIN_PASSWORD = 'Demo-Admin-Passwort-123';
const SUPER_EMAIL = 'superadmin@example.org';
const SUPER_PASSWORD = 'Demo-Super-Passwort-123';
const DEMO_TOKEN_MASK = 'DEMO-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX';

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

const ENV = {
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ?? 'postgresql://hinschg:hinschg@localhost:5432/hinschg?schema=public',
  MASTER_ENCRYPTION_KEY: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=',
  SESSION_SECRET: 'screenshot-session-secret-mindestens-16',
  E2E_SUBMIT_ENABLED: 'true', // Stufe 2 aktiv -> Token-Login trifft beim ersten Versuch
  BILLING_ENABLED: 'true', // Tarif-/Managed-UI sichtbar machen (nur Anzeige, kein Stripe)
  SEED_ADMIN_EMAIL: ADMIN_EMAIL,
  SEED_ADMIN_PASSWORD: ADMIN_PASSWORD,
  SEED_SUPERADMIN_EMAIL: SUPER_EMAIL,
  SEED_SUPERADMIN_PASSWORD: SUPER_PASSWORD,
  NODE_ENV: 'production',
  NEXT_TELEMETRY_DISABLED: '1',
} as NodeJS.ProcessEnv;

function run(cmd: string): void {
  execSync(cmd, { stdio: 'inherit', env: ENV });
}

async function waitForServer(url: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {
      /* noch nicht bereit */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server nicht erreichbar: ${url}`);
}

// Ersetzt jeden Text, der wie ein Receipt-Token aussieht, durch den Dummy.
async function maskTokens(page: Page): Promise<void> {
  await page.evaluate((mask) => {
    const re = /\b([A-Z2-7]{4}-){7}[A-Z2-7]{4}\b/g;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) nodes.push(n as Text);
    for (const t of nodes) {
      if (t.nodeValue && re.test(t.nodeValue)) {
        t.nodeValue = t.nodeValue.replace(re, mask);
      }
    }
  }, DEMO_TOKEN_MASK);
}

async function shot(page: Page, name: string, opts: { fullPage?: boolean } = {}): Promise<void> {
  await maskTokens(page);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: opts.fullPage ?? true });
  console.log(`  ✓ ${name}.png`);
}

// TOTP-Secret wird beim ersten Login (Setup) ermittelt und danach wiederverwendet.
let adminTotpSecret = '';

async function loginWithRole(
  page: Page,
  email: string,
  password: string,
  secretRef: { value: string },
  expectedHeading: string,
): Promise<void> {
  await page.goto(`${BASE}/admin/login`);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.locator('#code').waitFor();
  // Erster Login: Secret wird angezeigt (Setup) -> auslesen; sonst gemerktes nutzen.
  const setupCode = page.locator('code.select-all');
  if (await setupCode.count()) {
    secretRef.value = (await setupCode.first().innerText()).trim();
  }
  await page.locator('#code').fill(authenticator.generate(secretRef.value));
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.getByRole('heading', { name: expectedHeading, exact: true }).waitFor();
}

async function adminLogin(page: Page): Promise<void> {
  const ref = { value: adminTotpSecret };
  await loginWithRole(page, ADMIN_EMAIL, ADMIN_PASSWORD, ref, 'Fall-Dashboard');
  adminTotpSecret = ref.value;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });

  // Vollständiger Reset für Reproduzierbarkeit: löscht alte Demo-Daten,
  // wendet Migrationen an und seedet frisch. So startet jeder Lauf im selben
  // deterministischen Zustand (keine bereits enrollte 2FA, keine Alt-Schlüssel,
  // keine Alt-Fälle), unabhängig von vorherigen Läufen.
  console.log('› Datenbank zurücksetzen + Demo-Seed laden …');
  run('npx prisma migrate reset --force --skip-generate');

  console.log('› App starten …');
  const server: ChildProcess = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    env: ENV,
    stdio: 'ignore',
  });

  let browser: Browser | undefined;
  try {
    await waitForServer(BASE);
    browser = await chromium.launch();

    // ---------- Bearbeiter: Login-Schritte (Screenshots vor dem TOTP-Setup) ----------
    {
      const ctx = await browser.newContext({ viewport: DESKTOP });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/admin/login`);
      await shot(page, 'admin-login');

      await page.locator('#email').fill(ADMIN_EMAIL);
      await page.locator('#password').fill(ADMIN_PASSWORD);
      await page.getByRole('button', { name: 'Weiter' }).click();
      await page.locator('#code').waitFor();
      // Neutraler Beispiel-Code im Feld (verhindert, dass ein evtl. vom Browser
      // automatisch eingetragener Wert das Setup-Bild verunreinigt).
      await page.locator('#code').fill('123456');
      await shot(page, 'admin-login-totp-setup');
      await ctx.close();
    }

    // ---------- Bearbeiter eingeloggt: Stufe-2 einrichten + Admin-Seiten ----------
    // Recovery- + Bearbeiter-Schlüssel einrichten, damit Meldungen Stufe-2-E2E
    // werden (Token-Login trifft dann beim ersten Versuch, ohne Backoff).
    {
      const ctx = await browser.newContext({ viewport: DESKTOP });
      const page = await ctx.newPage();
      await adminLogin(page);

      // Org-Recovery-Schlüssel (Keygen im Browser).
      await page.goto(`${BASE}/admin/e2e`);
      await page.locator('#passphrase').fill('demo-recovery-passphrase-1234');
      await page.locator('#confirm').fill('demo-recovery-passphrase-1234');
      await page.getByRole('button', { name: 'Recovery-Schlüssel erzeugen' }).click();
      await page.getByText('Recovery-Schlüssel ist eingerichtet.').waitFor();
      await shot(page, 'admin-e2e');

      // Eigenes Bearbeiter-Schlüsselpaar (Keygen im Browser).
      await page.goto(`${BASE}/admin/keys`);
      await page.locator('#password').fill(ADMIN_PASSWORD);
      await page.getByRole('button', { name: 'Schlüsselpaar einrichten' }).click();
      await page.getByText('Schlüsselpaar ist eingerichtet.').waitFor();
      await shot(page, 'admin-keys');
      await ctx.close();
    }

    // ---------- Demo-Fall (jetzt Stufe-2-E2E) + Postfach-Token ----------
    let demoToken = '';
    {
      const ctx = await browser.newContext({ viewport: DESKTOP });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/melden`);
      await page.locator('#category').selectOption('compliance');
      await page
        .locator('#description')
        .fill(
          'Demo-Meldung: In der Beispiel-Abteilung wurde eine interne Richtlinie nicht eingehalten. (Dies ist ein Demonstrationsdatensatz, keine echte Meldung.)',
        );
      await page.getByRole('button', { name: 'Meldung absenden' }).click();
      await page.getByText('Ihre Meldung wurde übermittelt').waitFor();
      // Bestätigt zusätzlich, dass Stufe-2 aktiv ist (E2E-Banner).
      await page.getByText('Der Inhalt wurde in Ihrem Browser verschlüsselt').waitFor();
      // Echten Token VOR dem Maskieren auslesen (shot() ersetzt ihn im DOM durch
      // den Dummy) — er wird nur fürs Postfach-Login gebraucht, nie gespeichert.
      demoToken = (await page.locator('code.select-all').first().innerText()).trim();
      await shot(page, 'melden-bestaetigung'); // Token im Screenshot maskiert
      await ctx.close();
    }

    // ---------- Öffentliche Seiten: Desktop + Mobil ----------
    for (const [label, vp] of [
      ['desktop', DESKTOP],
      ['mobile', MOBILE],
    ] as const) {
      const ctx = await browser.newContext({ viewport: vp });
      const page = await ctx.newPage();
      const suffix = label === 'mobile' ? '-mobile' : '';

      await page.goto(`${BASE}/`);
      await shot(page, `landing${suffix}`);

      await page.goto(`${BASE}/melden`);
      await page.getByRole('heading', { name: 'Meldung einreichen' }).first().waitFor();
      await shot(page, `melden${suffix}`);

      // Mandantenspezifische Melde-Strecke /m/[slug]/melden (Multi-Tenant).
      await page.goto(`${BASE}/m/demo/melden`);
      await page.getByText('Meldestelle: Demo-Meldestelle').waitFor();
      await shot(page, `melden-tenant${suffix}`);

      // Postfach-Login (leeres Formular).
      await page.goto(`${BASE}/postfach`);
      await page.getByRole('heading', { name: 'Postfach öffnen' }).waitFor();
      await shot(page, `postfach-login${suffix}`);

      await ctx.close();
    }

    // ---------- Eingeloggte Postfach-Ansicht (Stufe-2-Token, erster Versuch) ----------
    {
      const ctx = await browser.newContext({ viewport: DESKTOP });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/postfach`);
      await page.locator('#token').fill(demoToken);
      await page.getByRole('button', { name: 'Postfach öffnen' }).click();
      await page.getByRole('heading', { name: 'Ihr Postfach' }).waitFor({ timeout: 30_000 });
      // Auf die clientseitige Entschlüsselung warten (zeigt den Meldungsinhalt).
      await page
        .getByText('In der Beispiel-Abteilung', { exact: false })
        .waitFor({ timeout: 30_000 });
      await shot(page, 'postfach-eingeloggt');
      await ctx.close();
    }

    // ---------- Bearbeiter: Dashboard, Case-Detail, Audit, Handlers ----------
    {
      const ctx = await browser.newContext({ viewport: DESKTOP });
      const page = await ctx.newPage();
      await adminLogin(page);

      await page.goto(`${BASE}/admin`);
      await page.getByRole('heading', { name: 'Fall-Dashboard' }).waitFor();
      await shot(page, 'admin-dashboard');

      // Erstes Fall-Detail öffnen (auf die Detail-URL warten; die Detail-
      // Überschrift "Fall <id>" vom Dashboard-Titel "Fall-Dashboard" abgrenzen).
      await page.locator('a[href^="/admin/cases/"]').first().click();
      await page.waitForURL(/\/admin\/cases\/.+/);
      await page.getByRole('heading', { name: /^Fall [a-z0-9]/ }).waitFor();
      await shot(page, 'admin-case-detail');

      await page.goto(`${BASE}/admin/audit`);
      await page.getByRole('heading', { name: 'Audit-Trail' }).waitFor();
      await shot(page, 'admin-audit');

      await page.goto(`${BASE}/admin/handlers`);
      await page.getByRole('heading', { name: 'Bearbeiter', exact: true }).waitFor();
      await shot(page, 'admin-handlers');
      await ctx.close();
    }

    // ---------- Plattform-Superadmin: Meldestellen / Tarife / Managed ----------
    {
      const ctx = await browser.newContext({ viewport: DESKTOP });
      const page = await ctx.newPage();
      // SUPERADMIN landet nach dem Login auf /admin/offices.
      await loginWithRole(page, SUPER_EMAIL, SUPER_PASSWORD, { value: '' }, 'Meldestellen');
      await shot(page, 'superadmin-offices');
      await ctx.close();
    }

    console.log('› Screenshots fertig in docs/screenshots/.');
  } finally {
    browser?.close();
    server.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
