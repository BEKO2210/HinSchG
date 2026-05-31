// HinSchG — API: Fallbearbeitung durch Befugte anfragen (Office-ADMIN)
//
// Phase 11a: Ein:e Office-ADMIN fragt die Zusatzleistung "Fallbearbeitung durch
// befugte Personen" (z. B. Partner-Anwält:innen) fuer die EIGENE Meldestelle an.
// Dies aendert KEINE Zugriffsrechte — es setzt nur einen Workflow-Status, den der
// SUPERADMIN anschliessend freischaltet. Die spaetere Bearbeitung erfolgt durch
// eine normale HANDLER-Bearbeiter:in der Meldestelle (mit eigenem Schluessel).

import { NextResponse } from 'next/server';
import { adminApiGuard } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  const guard = adminApiGuard(['ADMIN']);
  if ('error' in guard) {
    return guard.error;
  }

  // Mandantentrennung: ausschliesslich die eigene Meldestelle.
  const office = await prisma.reportingOffice.findUnique({
    where: { id: guard.session.o },
    select: { id: true, managedProcessing: true, processingRequest: true },
  });
  if (!office) {
    return NextResponse.json({ error: 'Meldestelle nicht gefunden.' }, { status: 404 });
  }
  if (office.managedProcessing || office.processingRequest === 'ACTIVE') {
    return NextResponse.json({ error: 'Die Leistung ist bereits aktiv.' }, { status: 409 });
  }
  if (office.processingRequest === 'REQUESTED') {
    return NextResponse.json({ ok: true, alreadyRequested: true }, { status: 200 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.reportingOffice.update({
      where: { id: office.id },
      data: { processingRequest: 'REQUESTED' },
    });
    await tx.auditLog.create({
      data: {
        actorType: 'HANDLER',
        actorId: guard.session.h,
        action: 'PROCESSING_REQUESTED',
        officeId: office.id,
      },
    });
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
