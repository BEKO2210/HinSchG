// HinSchG — API: Bearbeitungs-Anfrage entscheiden (nur SUPERADMIN)
//
// Phase 11a: Der SUPERADMIN schaltet die angefragte managedProcessing-Leistung
// frei (approve) oder lehnt sie ab (decline). Approve setzt managedProcessing=true
// und processingRequest=ACTIVE; decline setzt processingRequest=DECLINED. Es
// werden KEINE Zugriffsrechte auf Fall-Inhalte vergeben — die Bearbeitung erfolgt
// weiterhin nur durch HANDLER-Bearbeiter:innen der Meldestelle mit eigenem Schluessel.

import { NextResponse } from 'next/server';
import { adminApiGuard } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const guard = adminApiGuard(['SUPERADMIN']);
  if ('error' in guard) {
    return guard.error;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiges JSON.' }, { status: 400 });
  }
  const decision = (raw as Record<string, unknown>)?.decision;
  if (decision !== 'approve' && decision !== 'decline') {
    return NextResponse.json({ error: 'Unbekannte Entscheidung.' }, { status: 400 });
  }

  const office = await prisma.reportingOffice.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!office) {
    return NextResponse.json({ error: 'Meldestelle nicht gefunden.' }, { status: 404 });
  }

  const approved = decision === 'approve';
  await prisma.$transaction(async (tx) => {
    await tx.reportingOffice.update({
      where: { id: office.id },
      data: approved
        ? { managedProcessing: true, processingRequest: 'ACTIVE' }
        : { managedProcessing: false, processingRequest: 'DECLINED' },
    });
    await tx.auditLog.create({
      data: {
        actorType: 'HANDLER',
        actorId: guard.session.h,
        action: 'PROCESSING_DECIDED',
        officeId: office.id,
        metadata: { decision },
      },
    });
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
