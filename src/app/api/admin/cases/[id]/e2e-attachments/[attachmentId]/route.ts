// HinSchG — API: verschluesselten Anhang als Bearbeiter:in abrufen (Stufe 2)
//
// Liefert den Ciphertext (Datei + Dateiname) + den fuer die anfragende
// Bearbeiter:in (session.h) bestimmten Schluessel-Wrap. Entschluesselung im
// Browser mit dem passwortgeschuetzten privaten Schluessel. Strikte
// Mandantentrennung: Fall + Anhang muessen zur Meldestelle der Session gehoeren.
// Zugriff wird als ATTACHMENT_VIEWED protokolliert.

import { NextResponse } from 'next/server';
import { adminApiGuard } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
): Promise<NextResponse> {
  const guard = await adminApiGuard(['ADMIN', 'HANDLER']);
  if ('error' in guard) {
    return guard.error;
  }

  // Anhang muss zum angegebenen Fall UND zur Meldestelle der Session gehoeren.
  const attachment = await prisma.caseAttachment.findFirst({
    where: {
      id: (await params).attachmentId,
      caseId: (await params).id,
      case: { officeId: guard.session.o },
    },
    select: {
      id: true,
      caseId: true,
      mimeType: true,
      encryptedBlobRef: true,
      encryptedFilename: true,
      keys: {
        where: { recipient: guard.session.h },
        select: { wrappedKey: true },
      },
    },
  });
  if (!attachment) {
    return NextResponse.json({ error: 'Anhang nicht gefunden.' }, { status: 404 });
  }
  const wrap = attachment.keys[0]?.wrappedKey;
  if (!wrap) {
    // Kein Wrap fuer diese:n Bearbeiter:in: Zugriff ggf. per Recovery-Re-Wrap
    // wiederherstellen (Phase 9a). Bewusst kein Inhalt.
    return NextResponse.json(
      { error: 'Kein Schlüssel für Ihren Zugang. Bitte per Recovery wiederherstellen.' },
      { status: 403 },
    );
  }

  await prisma.auditLog.create({
    data: {
      actorType: 'HANDLER',
      actorId: guard.session.h,
      action: 'ATTACHMENT_VIEWED',
      caseId: attachment.caseId,
      officeId: guard.session.o,
      metadata: { mimeType: attachment.mimeType },
    },
  });

  return NextResponse.json({
    mimeType: attachment.mimeType,
    blob: JSON.parse(attachment.encryptedBlobRef) as { nonce: string; content: string },
    filename: JSON.parse(attachment.encryptedFilename) as { nonce: string; content: string },
    wrap,
  });
}
