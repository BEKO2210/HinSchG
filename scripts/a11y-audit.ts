/* eslint-disable no-console */
// HinSchG — BITV 2.0 / WCAG 2.1 AA Audit (axe-core, headless Chromium)
//
// Fährt die App hoch, seedet deterministisch und prüft jede UI-Seite des
// App-Routers mit axe-core gegen die für BITV 2.0 maßgeblichen Regeln
// (EN 301 549 -> WCAG 2.1 Level A + AA). Gibt gefundene Verstöße je Seite aus
// und beendet sich mit Exit-Code 1, sobald ein Verstoß auftritt.
//
// Aufruf: npm run a11y

import { spawn, type ChildProcess, execSync } from 'node:child_process';
import { chromium, type Browser, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { authenticator } from 'otplib';

const PORT = 3216;
const BASE = `http://localhost:${PORT}`;

const ADMIN_EMAIL = 'admin@example.org';
const ADMIN_PASSWORD = 'Demo-Admin-Passwort-123';
const SUPER_EMAIL = 'superadmin@example.org';
const SUPER_PASSWORD = 'Demo-Super-Passwort-123';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const ENV = {
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ?? 'postgresql://hinschg:hinschg@localhost:5432/hinschg?schema=public',
  MASTER_ENCRYPTION_KEY: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=',
  SESSION_SECRET: 'a11y-audit-session-secret-mindestens-16',
  E2E_SUBMIT_ENABLED: 'true',
  BILLING_ENABLED: 'true',
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

interface Violation {
  id: string;
  impact?: string | null;
  help: string;
  nodes: { target: unknown[] }[];
}

let totalViolations = 0;

async function audit(page: Page, name: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const violations = results.violations as unknown as Violation[];
  if (violations.length === 0) {
    console.log(`  ✓ ${name}: keine Verstöße`);
    return;
  }
  totalViolations += violations.length;
  console.log(`  ✗ ${name}: ${violations.length} Verstoß/Verstöße`);
  for (const v of violations) {
    const targets = v.nodes.map((n) => JSON.stringify(n.target)).join(', ');
    console.log(`     - [${v.impact ?? 'n/a'}] ${v.id}: ${v.help}`);
    console.log(`       Elemente: ${targets}`);
  }
}

let adminTotpSecret = '';

async function login(
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
  const setupCode = page.locator('code.select-all');
  if (await setupCode.count()) {
    secretRef.value = (await setupCode.first().innerText()).trim();
  }
  await page.locator('#code').fill(authenticator.generate(secretRef.value));
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.getByRole('heading', { name: expectedHeading, exact: true }).waitFor();
}

async function main(): Promise<void> {
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
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    console.log('› Öffentliche Seiten prüfen …');
    await page.goto(`${BASE}/`);
    await audit(page, 'landing (/)');

    await page.goto(`${BASE}/melden`);
    await page.getByRole('heading', { name: 'Meldung einreichen' }).first().waitFor();
    await audit(page, 'melden (/melden)');

    await page.goto(`${BASE}/m/demo/melden`);
    await page.getByText('Meldestelle: Demo-Meldestelle').waitFor();
    await audit(page, 'melden-tenant (/m/demo/melden)');

    await page.goto(`${BASE}/postfach`);
    await page.getByRole('heading', { name: 'Postfach öffnen' }).waitFor();
    await audit(page, 'postfach-login (/postfach)');

    console.log('› Bearbeiter-Seiten prüfen …');
    await page.goto(`${BASE}/admin/login`);
    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('#password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.locator('#code').waitFor();
    await audit(page, 'admin-login (TOTP-Setup)');

    const ref = { value: adminTotpSecret };
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD, ref, 'Fall-Dashboard');
    adminTotpSecret = ref.value;
    await audit(page, 'admin-dashboard (/admin)');

    await page.goto(`${BASE}/admin/e2e`);
    await page.getByRole('heading', { name: 'Ende-zu-Ende-Verschlüsselung' }).waitFor();
    await audit(page, 'admin-e2e (/admin/e2e)');

    await page.goto(`${BASE}/admin/keys`);
    await audit(page, 'admin-keys (/admin/keys)');

    await page.goto(`${BASE}/admin/audit`);
    await page.getByRole('heading', { name: 'Audit-Trail' }).waitFor();
    await audit(page, 'admin-audit (/admin/audit)');

    await page.goto(`${BASE}/admin/handlers`);
    await page.getByRole('heading', { name: 'Bearbeiter', exact: true }).waitFor();
    await audit(page, 'admin-handlers (/admin/handlers)');

    console.log('› Superadmin-Seite prüfen …');
    const sctx = await browser.newContext();
    const spage = await sctx.newPage();
    await login(spage, SUPER_EMAIL, SUPER_PASSWORD, { value: '' }, 'Meldestellen');
    await audit(spage, 'superadmin-offices (/admin/offices)');

    console.log(
      totalViolations === 0
        ? '\n› Ergebnis: keine WCAG-2.1-AA-Verstöße gefunden.'
        : `\n› Ergebnis: ${totalViolations} Verstoß/Verstöße gefunden.`,
    );
  } finally {
    browser?.close();
    server.kill('SIGTERM');
  }
  if (totalViolations > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
