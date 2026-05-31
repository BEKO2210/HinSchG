import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// BITV 2.0 / WCAG 2.1 AA: automatisierte Barrierefreiheitsprüfung der
// öffentlichen, kontofreien Seiten (Hinweisgeber-Sicht) sowie der Login-Seite.
// Macht Barrierefreiheit zu einer CI-geprüften Eigenschaft. Die vollständige
// Prüfung inkl. eingeloggter Bearbeiter-Seiten liefert `npm run a11y`.

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectNoViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  // Bei Verstößen die betroffenen Regeln lesbar in den Assertion-Text schreiben.
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.help}`);
  expect(summary, summary.join('\n')).toEqual([]);
}

test('Startseite erfüllt WCAG 2.1 AA', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Meldung einreichen' })).toBeVisible();
  await expectNoViolations(page);
});

test('Meldeformular erfüllt WCAG 2.1 AA', async ({ page }) => {
  await page.goto('/melden');
  await expect(page.getByRole('heading', { name: 'Meldung einreichen' }).first()).toBeVisible();
  await expectNoViolations(page);
});

test('Mandanten-Meldeformular erfüllt WCAG 2.1 AA', async ({ page }) => {
  await page.goto('/m/demo/melden');
  await expect(page.getByText('Meldestelle: Demo-Meldestelle')).toBeVisible();
  await expectNoViolations(page);
});

test('Postfach-Login erfüllt WCAG 2.1 AA', async ({ page }) => {
  await page.goto('/postfach');
  await expect(page.getByRole('heading', { name: 'Postfach öffnen' })).toBeVisible();
  await expectNoViolations(page);
});

test('Bearbeiter-Login erfüllt WCAG 2.1 AA', async ({ page }) => {
  await page.goto('/admin/login');
  await expect(page.getByRole('heading', { name: 'Meldestelle' })).toBeVisible();
  await expectNoViolations(page);
});

test('Sprungmarke „Zum Inhalt springen" ist vorhanden und zielt auf den Hauptinhalt', async ({
  page,
}) => {
  await page.goto('/');
  const skip = page.getByRole('link', { name: 'Zum Inhalt springen' });
  await expect(skip).toHaveAttribute('href', '#hauptinhalt');
  // Zielanker existiert und ist programmatisch fokussierbar.
  await expect(page.locator('main#hauptinhalt')).toHaveCount(1);
});
