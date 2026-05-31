// HinSchG — Vitest-Konfiguration
//
// Stellt den `@/`-Alias (analog zu tsconfig "paths") bereit, damit auch
// Module/Tests, die `@/lib/...` importieren (z. B. API-Routen und Middleware),
// in der Testumgebung aufgelöst werden. Coverage via v8 ist optional und wird
// nur mit `--coverage` (Skript `test:coverage`) geladen.

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // Nur Unit-Tests unter src/ ausführen. Playwright-Specs (e2e/*.spec.ts)
    // werden von `npm run test:e2e` gefahren und dürfen hier nicht eingesammelt
    // werden (sie nutzen @playwright/test statt vitest).
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      // Abdeckungs-Gate gilt fuer den rein unit-testbaren Sicherheitskern
      // (src/lib). Die App-/Routen-/Komponentenschicht (React Server Components,
      // Browser-DOM, Netzwerk-/DB-IO) wird durch die Playwright-Browser-Tests
      // (e2e/) abgedeckt, nicht durch Vitest.
      include: ['src/lib/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/*.d.ts',
        // Browser-only: nutzt document/canvas/createImageBitmap/Blob/URL — nicht
        // in der Node-Testumgebung ausfuehrbar; durch Playwright (Upload-Flow) gedeckt.
        'src/lib/attachments-client.ts',
        // Prisma-Client-Singleton (seiteneffektbehaftete Modul-Initialisierung,
        // keine Logik); durch Integrationsbetrieb/Playwright gedeckt.
        'src/lib/db.ts',
      ],
      // CI-Gate: Build/Test faellt unter 100% Lines + Branches (+ Funcs/Stmts).
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
