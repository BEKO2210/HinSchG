import { execSync } from 'node:child_process';
import { TEST_ENV } from '../playwright.config';

// Setzt die Test-Datenbank vor dem Lauf sauber auf (Migrationen + Seed mit
// bekanntem Admin-Passwort), damit die Browser-Tests deterministisch sind.
export default function globalSetup(): void {
  const env = { ...process.env, ...TEST_ENV } as NodeJS.ProcessEnv;
  const run = (cmd: string) => execSync(cmd, { stdio: 'inherit', env });
  run('npx prisma migrate reset --force --skip-seed');
  run('npx prisma db seed');
}
