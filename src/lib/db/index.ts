// HinSchG — Datenbank-Modul
//
// Phase 0: nur Platzhalter. In Phase 1 entsteht hier das Prisma-Client-Singleton
// (siehe ARCHITECTURE.md Abschnitt 4), das in Entwicklung HMR-sicher ist:
//
//   import { PrismaClient } from '@prisma/client';
//   const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
//   export const prisma = globalForPrisma.prisma ?? new PrismaClient();
//   if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
//
// Erst nach dem Anlegen der Modelle in prisma/schema.prisma aktivieren.

export {};
