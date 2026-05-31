import { afterEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { getRetentionDays, isCaseExpired, purgeExpiredCases } from './retention';

const NOW = new Date('2026-05-31T12:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

describe('isCaseExpired', () => {
  it('ist false für nicht geschlossene Fälle (closedAt null)', () => {
    expect(isCaseExpired(null, 30, NOW)).toBe(false);
  });

  it('ist false, wenn die Aufbewahrung deaktiviert ist (0 Tage)', () => {
    expect(isCaseExpired(new Date(NOW - 1000 * DAY), 0, NOW)).toBe(false);
  });

  it('ist false innerhalb der Frist', () => {
    expect(isCaseExpired(new Date(NOW - 10 * DAY), 30, NOW)).toBe(false);
  });

  it('ist true nach Ablauf der Frist', () => {
    expect(isCaseExpired(new Date(NOW - 31 * DAY), 30, NOW)).toBe(true);
  });
});

describe('getRetentionDays', () => {
  const orig = process.env.CASE_RETENTION_DAYS;
  afterEach(() => {
    if (orig === undefined) delete process.env.CASE_RETENTION_DAYS;
    else process.env.CASE_RETENTION_DAYS = orig;
  });

  it('liefert 0 ohne/ungültiger Konfiguration', () => {
    delete process.env.CASE_RETENTION_DAYS;
    expect(getRetentionDays()).toBe(0);
    process.env.CASE_RETENTION_DAYS = 'abc';
    expect(getRetentionDays()).toBe(0);
    process.env.CASE_RETENTION_DAYS = '-5';
    expect(getRetentionDays()).toBe(0);
  });

  it('liest und floored einen positiven Wert', () => {
    process.env.CASE_RETENTION_DAYS = '30.9';
    expect(getRetentionDays()).toBe(30);
  });
});

// Minimaler Prisma-Stub: nur die von purgeExpiredCases genutzten Methoden.
function makePrismaStub(expiredIds: string[]) {
  const deleted: string[] = [];
  const audits: { caseId: string }[] = [];
  const prisma = {
    case: {
      findMany: async () => expiredIds.map((id) => ({ id })),
    },
    $transaction: async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        case: {
          delete: async ({ where }: { where: { id: string } }) => {
            deleted.push(where.id);
          },
        },
        auditLog: {
          create: async ({ data }: { data: { caseId: string } }) => {
            audits.push({ caseId: data.caseId });
          },
        },
      };
      await fn(tx);
    },
  } as unknown as PrismaClient;
  return { prisma, deleted, audits };
}

describe('purgeExpiredCases', () => {
  it('löscht nichts bei deaktivierter Aufbewahrung (retentionDays <= 0)', async () => {
    const { prisma, deleted } = makePrismaStub(['c1']);
    expect(await purgeExpiredCases(prisma, 0, NOW)).toBe(0);
    expect(deleted).toEqual([]);
  });

  it('löscht abgelaufene Fälle und schreibt je einen CASE_PURGED-Audit', async () => {
    const { prisma, deleted, audits } = makePrismaStub(['c1', 'c2', 'c3']);
    const purged = await purgeExpiredCases(prisma, 30, NOW);
    expect(purged).toBe(3);
    expect(deleted).toEqual(['c1', 'c2', 'c3']);
    expect(audits.map((a) => a.caseId)).toEqual(['c1', 'c2', 'c3']);
  });

  it('gibt 0 zurück, wenn keine Fälle abgelaufen sind', async () => {
    const { prisma } = makePrismaStub([]);
    expect(await purgeExpiredCases(prisma, 30, NOW)).toBe(0);
  });
});
