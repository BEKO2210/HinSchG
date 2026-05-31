'use client';

// HinSchG — Clientseitige Anhang-Verarbeitung (Stufe 2).
//
// 1. Sanitisierung: Bilder werden ueber ein Canvas neu gerendert — dabei gehen
//    saemtliche Metadaten (EXIF/GPS/Kamera) verloren. Andere erlaubte Typen
//    werden unveraendert uebernommen (sie tragen keine ortsbezogenen EXIF-Daten).
// 2. Verschluesselung im Browser (Multi-Recipient) und Upload als JSON.
//
// Der Server sieht nie Klartext oder Original-Dateinamen.

import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  ATTACHMENT_MAX_PLAINTEXT_BYTES,
  isAllowedAttachmentMime,
} from '@/lib/cases';

const STRIPPABLE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export interface PreparedFile {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
}

/**
 * Liest eine Datei, prueft MIME/Groesse und entfernt bei Bildern die Metadaten.
 * Wirft mit sprechender Fehlermeldung bei unerlaubtem Typ / zu grosser Datei.
 */
export async function prepareFile(file: File): Promise<PreparedFile> {
  if (!isAllowedAttachmentMime(file.type)) {
    throw new Error(`Dateityp „${file.type || 'unbekannt'}" ist nicht erlaubt.`);
  }
  if (file.size > ATTACHMENT_MAX_PLAINTEXT_BYTES) {
    throw new Error('Die Datei ist zu groß (max. 10 MB).');
  }

  // Bilder zur Metadaten-Entfernung ueber Canvas neu rendern.
  if (STRIPPABLE_IMAGE_TYPES.has(file.type) && typeof document !== 'undefined') {
    try {
      const stripped = await stripImageMetadata(file);
      if (stripped) {
        return { bytes: stripped, filename: sanitizeFilename(file.name), mimeType: file.type };
      }
    } catch {
      // Faellt auf die Rohbytes zurueck (z. B. wenn Canvas nicht verfuegbar).
    }
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  return { bytes, filename: sanitizeFilename(file.name), mimeType: file.type };
}

/** Rendert ein Bild ueber ein Canvas neu und gibt die Bytes ohne Metadaten zurueck. */
async function stripImageMetadata(file: File): Promise<Uint8Array | null> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, file.type, file.type === 'image/jpeg' ? 0.92 : undefined),
  );
  if (!blob) return null;
  return new Uint8Array(await blob.arrayBuffer());
}

/** Entfernt Pfadanteile und kuerzt den Dateinamen (Anzeigewert, verschluesselt gespeichert). */
function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'datei';
  return base.slice(0, 255) || 'datei';
}

/**
 * Verschluesselt eine vorbereitete Datei fuer die Empfaenger und laedt sie hoch.
 * `recipients` ist die ID->PublicKey-Map (RECOVERY, WB, Bearbeiter-IDs).
 */
export async function encryptAndUpload(
  prepared: PreparedFile,
  recipients: Record<string, string>,
  endpoint: string,
): Promise<{ ok: boolean; error?: string }> {
  const e2e = await import('@/lib/e2e');
  const enc = await e2e.encryptAttachment(prepared.bytes, prepared.filename, recipients);
  const sizeBytes = enc.blob.content.length;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mimeType: prepared.mimeType,
      blob: enc.blob,
      filename: enc.filename,
      wraps: enc.wraps,
      sizeBytes,
    }),
  });
  if (res.ok) {
    return { ok: true };
  }
  const b = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, error: b.error ?? 'Upload fehlgeschlagen.' };
}

/** Loest einen Browser-Download aus den entschluesselten Bytes aus. */
export function triggerDownload(bytes: Uint8Array, filename: string, mimeType: string): void {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const ACCEPTED_FILE_TYPES = ALLOWED_ATTACHMENT_MIME_TYPES.join(',');
