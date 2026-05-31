// HinSchG — API: Fallstatus ändern (mit Status-Historie + Audit)

import { NextResponse } from 'next/server';
import { adminApiGuard } from '@/lib/admin-auth';
import { isCaseStatus } from '@/lib/case-status';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await adminApiGuard(['ADMIN', 'HANDLER']);
  if ('error' in guard) {
    return guard.error;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiges JSON.' }, { status: 400 });
  }
  const status = (raw as Record<string, unknown>)?.status;
  if (!isCaseStatus(status)) {
    return NextResponse.json({ error: 'Unbekannter Status.' }, { status: 400 });
  }

  const existing = await prisma.case.findFirst({
    where: { id: (await params).id, officeId: guard.session.o },
    select: { id: true, status: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Fall nicht gefunden.' }, { status: 404 });
  }
  if (existing.status === status) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  // closedAt steuert die Loeschfrist: bei CLOSED/REJECTED setzen, sonst zuruecksetzen.
  const closedAt = status === 'CLOSED' || status === 'REJECTED' ? new Date() : null;

  await prisma.$transaction(async (tx) => {
    await tx.case.update({ where: { id: existing.id }, data: { status, closedAt } });
    await tx.caseStatusHistory.create({
      data: {
        caseId: existing.id,
        fromStatus: existing.status,
        toStatus: status,
        changedBy: guard.session.h,
      },
    });
    await tx.auditLog.create({
      data: {
        actorType: 'HANDLER',
        actorId: guard.session.h,
        action: 'STATUS_CHANGED',
        caseId: existing.id,
        officeId: guard.session.o,
        metadata: { from: existing.status, to: status },
      },
    });
  });

  return NextResponse.json({ ok: true });
}
