import { defineConfig, devices } from '@playwright/test';

// Browser-E2E-Tests: starten die echte App (next start) gegen die lokale
// Test-Datenbank und führen die clientseitige Krypto real im Browser aus.

const PORT = 3210;
const BASE_URL = `http://localhost:${PORT}`;

// Test-Umgebung (lokale Postgres-Instanz; Secrets sind reine Testwerte).
export const TEST_ENV = {
  DATABASE_URL:
    process.env.DATABASE_URL ?? 'postgresql://hinschg:hinschg@localhost:5432/hinschg?schema=public',
  MASTER_ENCRYPTION_KEY: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=',
  SESSION_SECRET: 'e2e-test-session-secret-mindestens-16',
  E2E_SUBMIT_ENABLED: 'true',
  SEED_ADMIN_PASSWORD: 'Admin-E2E-Passwort-123',
  // Zweite Meldestelle inkl. eigenem Fall fuer den Cross-Tenant-Isolationstest.
  SEED_SECOND_OFFICE: 'true',
  NODE_ENV: 'production',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  globalSetup: './e2e/global-setup.ts',
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    locale: 'de-DE',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: TEST_ENV,
  },
});
