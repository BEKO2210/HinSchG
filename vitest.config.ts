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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/*.d.ts',
        // UI-Layout/CSS und reine Re-Export-Platzhalter sind nicht sinnvoll abdeckbar.
        'src/app/**/layout.tsx',
        'src/app/**/globals.css',
        'src/lib/auth/index.ts',
      ],
    },
  },
});
