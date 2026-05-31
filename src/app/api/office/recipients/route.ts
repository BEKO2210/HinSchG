// HinSchG — API: oeffentliche Empfaengerschluessel fuer Stufe-2-E2E
//
// Liefert die Public Keys, an die eine Meldung (oder Nachricht) verschluesselt
// werden muss: alle Bearbeiter:innen mit hinterlegtem Schluessel + der
// Org-Recovery-Schluessel. Public Keys sind oeffentlich — es werden keine
// privaten Schluessel oder personenbezogene Daten zurueckgegeben.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const office = await prisma.reportingOffice.findFirst({
    orderBy: { createdAt: 'asc' },
    select: {
      recoveryPublicKey: true,
      handlers: {
        where: { publicKey: { not: null } },
        select: { id: true, publicKey: true },
      },
    },
  });

  // Stufe-2-Submit ist standardmaessig aktiv und nur durch explizites
  // E2E_SUBMIT_ENABLED=false abschaltbar. Ist E2E nicht eingerichtet (kein
  // Recovery-/Bearbeiter-Schluessel), faellt die Meldestrecke automatisch auf
  // Stufe 1 zurueck (ready=false). Hinweis: Stufe 2 ist noch nicht extern auditiert.
  const submitEnabled = process.env.E2E_SUBMIT_ENABLED !== 'false';

  if (!office) {
    return NextResponse.json(
      { ready: false, submitEnabled, recovery: null, handlers: [] },
      { status: 200 },
    );
  }

  const handlers = office.handlers.map((h) => ({ id: h.id, publicKey: h.publicKey as string }));
  // E2E ist erst moeglich, wenn ein Recovery-Schluessel UND mindestens ein
  // Bearbeiter-Schluessel vorhanden sind.
  const ready = Boolean(office.recoveryPublicKey) && handlers.length > 0;

  return NextResponse.json(
    { ready, submitEnabled, recovery: office.recoveryPublicKey, handlers },
    { status: 200 },
  );
}
