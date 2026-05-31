// HinSchG — API: Schweregrad eines Falls setzen (mit Audit)

import { NextResponse } from 'next/server';
import { adminApiGuard } from '@/lib/admin-auth';
import { isSeverity } from '@/lib/case-status';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const guard = adminApiGuard(['ADMIN', 'HANDLER']);
  if ('error' in guard) {
    return guard.error;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiges JSON.' }, { status: 400 });
  }
  const severity = (raw as Record<string, unknown>)?.severity;
  if (!isSeverity(severity)) {
    return NextResponse.json({ error: 'Unbekannter Schweregrad.' }, { status: 400 });
  }

  const existing = await prisma.case.findUnique({
    where: { id: params.id },
    select: { id: true, severity: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Fall nicht gefunden.' }, { status: 404 });
  }
  if (existing.severity === severity) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  await prisma.$transaction(async (tx) => {
    await tx.case.update({ where: { id: existing.id }, data: { severity } });
    await tx.auditLog.create({
      data: {
        actorType: 'HANDLER',
        actorId: guard.session.h,
        action: 'SEVERITY_CHANGED',
        caseId: existing.id,
        metadata: { from: existing.severity, to: severity },
      },
    });
  });

  return NextResponse.json({ ok: true });
}
