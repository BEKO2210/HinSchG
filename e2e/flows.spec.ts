import { PrismaClient } from '@prisma/client';
import { expect, test } from '@playwright/test';
import { authenticator } from 'otplib';
import { TEST_ENV } from '../playwright.config';

const prisma = new PrismaClient({ datasources: { db: { url: TEST_ENV.DATABASE_URL } } });
test.afterAll(async () => {
  await prisma.$disconnect();
});

authenticator.options = { window: 1 };

const ADMIN_EMAIL = 'admin@example.org';
const ADMIN_PASSWORD = TEST_ENV.SEED_ADMIN_PASSWORD;
const TOKEN_RE = /^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/;

// Wird beim TOTP-Setup (Test 2) gelesen und in späteren Tests zum Login genutzt.
let adminTotpSecret = '';
// Der in Test 3 erzeugte E2E-Receipt-Token (für die Hinweisgeber-Sicht in Test 5).
let wbE2eToken = '';

// Tests bauen aufeinander auf (gemeinsame Datenbank), daher seriell.
test.describe.configure({ mode: 'serial' });

test('öffentliche Meldung (Stufe 1) zeigt einen Zugangscode', async ({ page }) => {
  await page.goto('/melden');
  await page.locator('#description').fill('E2E-Test: ein Verdacht auf Missstände.');
  await page.getByRole('button', { name: 'Meldung absenden' }).click();

  await expect(page.getByText('Ihre Meldung wurde übermittelt')).toBeVisible();
  const token = (await page.locator('code.select-all').first().innerText()).trim();
  expect(token).toMatch(TOKEN_RE);
  // Vor der E2E-Einrichtung wird serverseitig verschlüsselt (kein E2E-Hinweis).
  await expect(page.getByText('Ende-zu-Ende-verschlüsselt')).toHaveCount(0);
});

test('Bearbeiter-Login mit TOTP-Setup, dann Recovery- und eigener Schlüssel', async ({ page }) => {
  // 1. Passwort
  await page.goto('/admin/login');
  await page.locator('#email').fill(ADMIN_EMAIL);
  await page.locator('#password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Weiter' }).click();

  // 2. TOTP-Setup: Secret von der Seite lesen und Code erzeugen
  const secret = (await page.locator('code.select-all').first().innerText()).trim();
  expect(secret.length).toBeGreaterThan(10);
  adminTotpSecret = secret;
  await page.locator('#code').fill(authenticator.generate(secret));
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Fall-Dashboard' })).toBeVisible();

  // 3. Org-Recovery-Schlüssel (Keygen im Browser)
  await page.goto('/admin/e2e');
  await page.locator('#passphrase').fill('recovery-passphrase-1234');
  await page.locator('#confirm').fill('recovery-passphrase-1234');
  await page.getByRole('button', { name: 'Recovery-Schlüssel erzeugen' }).click();
  await expect(page.getByText('Recovery-Schlüssel ist eingerichtet.')).toBeVisible();

  // 4. Eigenes Bearbeiter-Schlüsselpaar (Keygen im Browser)
  await page.goto('/admin/keys');
  await page.locator('#password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Schlüsselpaar einrichten' }).click();
  await expect(page.getByText('Schlüsselpaar ist eingerichtet.')).toBeVisible();
});

test('öffentliche Meldung ist nun Ende-zu-Ende-verschlüsselt (Browser-Krypto)', async ({
  browser,
}) => {
  // Frischer Kontext ohne Admin-Cookies (echte Hinweisgeber-Sicht).
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/melden');
  await page.locator('#description').fill('E2E-Test: vertraulicher Hinweis (verschlüsselt).');
  await page.getByRole('button', { name: 'Meldung absenden' }).click();

  await expect(page.getByText('Ihre Meldung wurde übermittelt')).toBeVisible();
  await expect(page.getByText('Ende-zu-Ende-verschlüsselt')).toBeVisible();
  const token = (await page.locator('code.select-all').first().innerText()).trim();
  expect(token).toMatch(TOKEN_RE);
  wbE2eToken = token;

  // Postfach-Login mit dem Token: zeigt den E2E-Status (clientseitige Anzeige folgt).
  await page.goto('/postfach');
  await page.locator('#token').fill(token);
  await page.getByRole('button', { name: 'Postfach öffnen' }).click();
  await expect(page.getByRole('heading', { name: 'Ihr Postfach' })).toBeVisible();
  await expect(page.getByText('Ende-zu-Ende-verschlüsselt').first()).toBeVisible();

  await context.close();
});

test('Meldestelle entschlüsselt den E2E-Fall im Browser und antwortet verschlüsselt', async ({
  page,
}) => {
  // Login (TOTP ist bereits eingerichtet -> Code aus gespeichertem Secret).
  await page.goto('/admin/login');
  await page.locator('#email').fill(ADMIN_EMAIL);
  await page.locator('#password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.locator('#code').fill(authenticator.generate(adminTotpSecret));
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Fall-Dashboard' })).toBeVisible();

  // Den zuletzt angelegten E2E-Fall gezielt öffnen.
  const e2eCase = await prisma.case.findFirst({
    where: { encryptionVersion: 2 },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  expect(e2eCase).not.toBeNull();
  await page.goto(`/admin/cases/${e2eCase!.id}`);
  await expect(page.getByRole('heading', { name: /^Fall/ })).toBeVisible();

  // Privaten Schlüssel im Browser entsperren und entschlüsseln.
  await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Entsperren & entschlüsseln' }).click();
  await expect(page.getByText('vertraulicher Hinweis')).toBeVisible();

  // Verschlüsselt antworten.
  await page.locator('#body').fill('Antwort der Meldestelle (E2E).');
  await page.getByRole('button', { name: 'Verschlüsselt antworten' }).click();
  await expect(page.getByText('Antwort der Meldestelle (E2E).')).toBeVisible();
});

test('Hinweisgeber liest die Office-Antwort im Browser und antwortet verschlüsselt', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Postfach mit dem Token öffnen (Stufe-2-Login speichert den Token im Tab).
  await page.goto('/postfach');
  await page.locator('#token').fill(wbE2eToken);
  await page.getByRole('button', { name: 'Postfach öffnen' }).click();
  await expect(page.getByRole('heading', { name: 'Ihr Postfach' })).toBeVisible();

  // Browser entschlüsselt Meldung + Office-Antwort aus Test 4.
  await expect(page.getByText('vertraulicher Hinweis')).toBeVisible();
  await expect(page.getByText('Antwort der Meldestelle (E2E).')).toBeVisible();

  // Verschlüsselt zurückschreiben.
  await page.locator('#body').fill('Rückmeldung des Hinweisgebers (E2E).');
  await page.getByRole('button', { name: 'Verschlüsselt senden' }).click();
  await expect(page.getByText('Rückmeldung des Hinweisgebers (E2E).')).toBeVisible();

  await context.close();
});

test('Mandantentrennung: ADMIN sieht keine Fälle einer fremden Meldestelle', async ({ page }) => {
  // Login als ADMIN der ersten Meldestelle (TOTP aus gespeichertem Secret).
  await page.goto('/admin/login');
  await page.locator('#email').fill(ADMIN_EMAIL);
  await page.locator('#password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.locator('#code').fill(authenticator.generate(adminTotpSecret));
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Fall-Dashboard' })).toBeVisible();

  // Fall der ZWEITEN Meldestelle (vom Seed angelegt) gezielt heraussuchen.
  const office2 = await prisma.reportingOffice.findUnique({ where: { slug: 'demo2' } });
  expect(office2).not.toBeNull();
  const foreignCase = await prisma.case.findFirst({
    where: { officeId: office2!.id },
    select: { id: true },
  });
  expect(foreignCase).not.toBeNull();

  // Direkter Aufruf des fremden Falls per ID muss ins Leere laufen (404),
  // obwohl die Session gültig ist — Mandantentrennung greift serverseitig.
  const response = await page.goto(`/admin/cases/${foreignCase!.id}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByText('Fall der zweiten Meldestelle')).toHaveCount(0);

  // Das eigene Dashboard listet den fremden Fall ebenfalls nicht.
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Fall-Dashboard' })).toBeVisible();
  await expect(page.getByRole('link', { name: foreignCase!.id.slice(0, 8) })).toHaveCount(0);
});

test('ADMIN setzt ein Bearbeiter-Schlüsselpaar zurück (Status wird „ausstehend")', async ({
  page,
}) => {
  // Login (TOTP aus gespeichertem Secret).
  await page.goto('/admin/login');
  await page.locator('#email').fill(ADMIN_EMAIL);
  await page.locator('#password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.locator('#code').fill(authenticator.generate(adminTotpSecret));
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Fall-Dashboard' })).toBeVisible();

  // Bearbeiterliste: Admin-Zeile hat aus Test 2 ein aktives Schlüsselpaar.
  await page.goto('/admin/handlers');
  const row = page.locator('li').filter({ hasText: ADMIN_EMAIL });
  await expect(row.getByText('Schlüssel aktiv')).toBeVisible();

  // Zurücksetzen: neues Initialpasswort, Keypaar wird verworfen.
  await row.getByRole('button', { name: 'Zurücksetzen' }).click();
  await row.locator('input[name="password"]').fill('Neues-Admin-Passwort-456');
  await row.getByRole('button', { name: 'Passwort & Schlüssel zurücksetzen' }).click();

  // Nach dem Reset (router.refresh) ist der Schlüssel ausstehend.
  await expect(row.getByText('Schlüssel ausstehend')).toBeVisible();
});
