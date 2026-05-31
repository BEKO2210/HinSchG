// HinSchG — API: verschluesselten Anhang im Postfach abrufen (Stufe 2)
//
// Liefert den Ciphertext (Datei + Dateiname) + den fuer den Hinweisgeber (WB)
// bestimmten Schluessel-Wrap. Die Entschluesselung passiert im Browser aus dem
// Receipt-Token. Strikte Bindung: der Anhang muss zum Fall der Session gehoeren.
// Zugriff wird als ATTACHMENT_VIEWED protokolliert.

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { RECIPIENT_WHISTLEBLOWER } from '@/lib/cases';
import { prisma } from '@/lib/db';
import { INBOX_COOKIE, verifyInboxSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const caseId = verifyInboxSession((await cookies()).get(INBOX_COOKIE)?.value);
  if (!caseId) {
    return NextResponse.json(
      { error: 'Nicht angemeldet oder Session abgelaufen.' },
      { status: 401 },
    );
  }

  // Bindung an den Fall der Session (verhindert Zugriff auf fremde Anhaenge).
  const attachment = await prisma.caseAttachment.findFirst({
    where: { id: (await params).id, caseId },
    select: {
      id: true,
      caseId: true,
      mimeType: true,
      encryptedBlobRef: true,
      encryptedFilename: true,
      case: { select: { officeId: true } },
      keys: {
        where: { recipient: RECIPIENT_WHISTLEBLOWER },
        select: { wrappedKey: true },
      },
    },
  });
  const wrap = attachment?.keys[0]?.wrappedKey;
  if (!attachment || !wrap) {
    return NextResponse.json({ error: 'Anhang nicht gefunden.' }, { status: 404 });
  }

  await prisma.auditLog.create({
    data: {
      actorType: 'WHISTLEBLOWER',
      action: 'ATTACHMENT_VIEWED',
      caseId: attachment.caseId,
      officeId: attachment.case.officeId,
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
