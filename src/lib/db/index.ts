// HinSchG — Prisma-Client-Singleton
//
// In der Entwicklung verhindert das Cachen am globalen Objekt, dass durch
// Hot-Reload zahlreiche PrismaClient-Instanzen (und DB-Verbindungen) entstehen.
// Siehe ARCHITECTURE.md Abschnitt 4.

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
