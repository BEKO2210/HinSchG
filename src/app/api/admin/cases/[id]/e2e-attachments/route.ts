// HinSchG — API: Ende-zu-Ende-Dateianhang der Meldestelle (Stufe 2)
//
// Bearbeiter:in haengt eine bereits clientseitig (Multi-Recipient) verschluesselte
// Datei an einen Fall. Der Server speichert nur Ciphertext + Schluessel-Wraps und
// protokolliert ATTACHMENT_ADDED. Strikte Mandantentrennung (officeId).

import { NextResponse } from 'next/server';
import { adminApiGuard } from '@/lib/admin-auth';
import { RECIPIENT_RECOVERY, RECIPIENT_WHISTLEBLOWER, validateE2eAttachment } from '@/lib/cases';
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
  const validation = validateE2eAttachment(raw);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const { mimeType, blob, filename, wraps, sizeBytes } = validation.value;

  // Mandantentrennung: Fall muss zur Meldestelle der Session gehoeren.
  const found = await prisma.case.findFirst({
    where: { id: params.id, officeId: guard.session.o },
    select: {
      id: true,
      encryptionVersion: true,
      office: { select: { handlers: { select: { id: true } } } },
    },
  });
  if (!found || found.encryptionVersion !== 2) {
    return NextResponse.json({ error: 'Fall nicht gefunden.' }, { status: 404 });
  }

  const validIds = new Set<string>([
    RECIPIENT_RECOVERY,
    RECIPIENT_WHISTLEBLOWER,
    ...found.office.handlers.map((h) => h.id),
  ]);
  for (const id of Object.keys(wraps)) {
    if (!validIds.has(id)) {
      return NextResponse.json(
        { error: 'Unbekannter Empfänger im Schlüssel-Wrap.' },
        { status: 400 },
      );
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const attachment = await tx.caseAttachment.create({
      data: {
        caseId: found.id,
        encryptedBlobRef: JSON.stringify(blob),
        encryptedFilename: JSON.stringify(filename),
        mimeType,
        sizeBytes,
      },
      select: { id: true },
    });
    await tx.caseAttachmentKey.createMany({
      data: Object.entries(wraps).map(([recipient, wrappedKey]) => ({
        attachmentId: attachment.id,
        recipient,
        wrappedKey,
      })),
    });
    await tx.auditLog.create({
      data: {
        actorType: 'HANDLER',
        actorId: guard.session.h,
        action: 'ATTACHMENT_ADDED',
        caseId: found.id,
        officeId: guard.session.o,
        metadata: { mimeType, sizeBytes },
      },
    });
    return attachment;
  });

  return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
}
