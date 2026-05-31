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
  // Spezifisch das E2E-Bestätigungs-Banner prüfen (nicht jeden Treffer von
  // "Ende-zu-Ende-verschlüsselt" — die Anhang-Sektion enthält den Begriff ebenfalls).
  await expect(
    page.getByText('Der Inhalt wurde in Ihrem Browser verschlüsselt'),
  ).toBeVisible();
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

test('Hinweisgeber lädt einen E2E-Anhang hoch und kann ihn herunterladen', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('/postfach');
  await page.locator('#token').fill(wbE2eToken);
  await page.getByRole('button', { name: 'Postfach öffnen' }).click();
  await expect(page.getByRole('heading', { name: 'Ihr Postfach' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Anhänge', exact: false })).toBeVisible();

  // Eine kleine PDF (gültiger MIME) über das Datei-Input anhängen.
  await page.setInputFiles('input[type="file"]', {
    name: 'beweis.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nHinSchG E2E Anhang Test\n%%EOF'),
  });

  // Nach dem (verschlüsselten) Upload erscheint der Anhang mit Download-Link.
  await expect(page.getByRole('button', { name: 'Herunterladen' })).toBeVisible({
    timeout: 20_000,
  });

  // Herunterladen + im Browser entschlüsseln -> Original-Dateiname zurück.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Herunterladen' }).first().click(),
  ]);
  expect(download.suggestedFilename()).toBe('beweis.pdf');

  await context.close();
});

test('Anhang-Negativfälle: falscher Token (401), unerlaubter MIME (400), fremder Anhang (404)', async ({
  request,
  browser,
}) => {
  // 1. Ohne gültige Postfach-Session -> 401.
  const noSession = await request.post('/api/inbox/e2e-attachments', {
    data: { mimeType: 'application/pdf', blob: {}, filename: {}, wraps: {}, sizeBytes: 1 },
  });
  expect(noSession.status()).toBe(401);

  // Gültige Postfach-Session über den v2-Token herstellen (tokenLookup-Login).
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/postfach');
  await page.locator('#token').fill(wbE2eToken);
  await page.getByRole('button', { name: 'Postfach öffnen' }).click();
  await expect(page.getByRole('heading', { name: 'Ihr Postfach' })).toBeVisible();

  // 2. Unerlaubter MIME-Typ -> 400 (serverseitige Whitelist).
  const b64 = 'A'.repeat(40);
  const badMime = await page.request.post('/api/inbox/e2e-attachments', {
    data: {
      mimeType: 'image/svg+xml',
      blob: { nonce: b64, content: b64 },
      filename: { nonce: b64, content: b64 },
      wraps: { RECOVERY: b64, WB: b64, x: b64 },
      sizeBytes: 40,
    },
  });
  expect(badMime.status()).toBe(400);

  // 3. Fremde Anhang-ID -> 404 (Bindung an den Fall der Session).
  const foreign = await page.request.get('/api/inbox/e2e-attachments/does-not-exist-id');
  expect(foreign.status()).toBe(404);

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

test('Mandanten-Melde-Strecke /m/[slug]/melden funktioniert; unbekannter Slug → 404', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Unbekannte Meldestelle -> 404.
  const missing = await page.goto('/m/gibt-es-nicht-xyz/melden');
  expect(missing?.status()).toBe(404);

  // Bekannte Meldestelle (Seed-Slug „demo") zeigt den Namen und nimmt Meldungen an.
  await page.goto('/m/demo/melden');
  await expect(page.getByText('Meldestelle: Demo-Meldestelle')).toBeVisible();
  await page.locator('#description').fill('E2E-Test: Hinweis über die Mandanten-URL.');
  await page.getByRole('button', { name: 'Meldung absenden' }).click();
  await expect(page.getByText('Ihre Meldung wurde übermittelt')).toBeVisible();
  const token = (await page.locator('code.select-all').first().innerText()).trim();
  expect(token).toMatch(TOKEN_RE);

  await context.close();
});

test('Office-Verwaltung ist SUPERADMIN-only: ADMIN erhält 403', async ({ page }) => {
  // Als ADMIN der ersten Meldestelle anmelden (TOTP aus gespeichertem Secret).
  await page.goto('/admin/login');
  await page.locator('#email').fill(ADMIN_EMAIL);
  await page.locator('#password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.locator('#code').fill(authenticator.generate(adminTotpSecret));
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Fall-Dashboard' })).toBeVisible();

  // Office-Anlage ist nur für SUPERADMIN erlaubt -> 403 für ADMIN.
  const status = await page.evaluate(async () => {
    const res = await fetch('/api/admin/offices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Unerlaubt', slug: 'unerlaubt' }),
    });
    return res.status;
  });
  expect(status).toBe(403);

  // Die Superadmin-Seite ist für ADMIN nicht zugänglich (Redirect, kein 200-Inhalt).
  await page.goto('/admin/offices');
  await expect(page.getByRole('heading', { name: 'Meldestellen' })).toHaveCount(0);
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

test('Sicherheit: falscher Token wird abgelehnt (401) und Brute-Force greift (429)', async ({
  request,
}) => {
  // Falscher/zufälliger Token -> 401.
  const wrong = await request.post('/api/inbox/auth', {
    data: { token: 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG-HHHH' },
  });
  expect(wrong.status()).toBe(401);

  // Wiederholte Fehlversuche -> exponentielles Backoff/Rate-Limit (429).
  let got429 = false;
  for (let i = 0; i < 8; i++) {
    const res = await request.post('/api/inbox/auth', {
      data: { token: `WRONG-${i}-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF` },
    });
    if (res.status() === 429) {
      got429 = true;
      break;
    }
  }
  expect(got429).toBe(true);
});

test('Sicherheit: Auth-Bypass-Versuche auf Admin-APIs werden mit 401 abgewiesen', async ({
  request,
}) => {
  // Ohne gültige Admin-Session -> 401 (kein Zugriff auf Fall-/Office-Operationen).
  const noAuth = await request.post('/api/admin/offices', {
    data: { name: 'Hacker-Meldestelle' },
  });
  expect(noAuth.status()).toBe(401);

  // Manipuliertes Session-Cookie -> ebenfalls 401 (HMAC-Signatur schlägt fehl).
  const forged = await request.post('/api/admin/offices', {
    headers: { Cookie: 'hinschg_admin=geforgt.invalid-signature' },
    data: { name: 'X' },
  });
  expect(forged.status()).toBe(401);
});

test('Sicherheit: Audit-Log ist append-only (DB-Trigger blockt UPDATE/DELETE)', async () => {
  // Es existieren durch die vorherigen Tests bereits Audit-Einträge.
  const entry = await prisma.auditLog.findFirst({ select: { id: true } });
  expect(entry).not.toBeNull();

  // UPDATE muss vom DB-Trigger abgelehnt werden.
  await expect(
    prisma.auditLog.update({ where: { id: entry!.id }, data: { action: 'MANIPULIERT' } }),
  ).rejects.toThrow();

  // DELETE muss ebenfalls abgelehnt werden.
  await expect(prisma.auditLog.delete({ where: { id: entry!.id } })).rejects.toThrow();

  // Der Eintrag ist unverändert vorhanden.
  const still = await prisma.auditLog.findUnique({ where: { id: entry!.id } });
  expect(still).not.toBeNull();
});
