// HinSchG — Integrationstest des kompletten Stufe-2-Lebenszyklus.
// Simuliert (rein mit e2e.ts, ohne Server) den gesamten Nachrichtenfluss und
// belegt die Zero-Knowledge-Eigenschaften: jeder berechtigte Empfaenger
// (Bearbeiter, Recovery, Hinweisgeber) kann lesen, Unberechtigte nicht.

import { describe, expect, it } from 'vitest';
import {
  decryptFromRecipient,
  deriveWhistleblowerKeyPair,
  encryptForRecipients,
  generateKeyPair,
  sealOpen,
  sealTo,
} from './e2e';
import { RECIPIENT_RECOVERY, RECIPIENT_WHISTLEBLOWER } from './cases';

describe('Stufe-2 Lebenszyklus (Zero-Knowledge)', () => {
  it('Meldung + beidseitige Antworten sind nur für berechtigte Empfänger lesbar', async () => {
    // Schlüssel: zwei Bearbeiter, Org-Recovery, Hinweisgeber (aus Token).
    const h1 = await generateKeyPair();
    const h2 = await generateKeyPair();
    const recovery = await generateKeyPair();
    const token = 'MGUW-EETI-SKDA-3JN3-LNLY-UHIO-RXNQ-HJYJ';
    const wb = await deriveWhistleblowerKeyPair(token);

    // Empfängerset = alle Bearbeiter + Recovery + Hinweisgeber.
    const recipients: Record<string, string> = {
      h1: h1.publicKey,
      h2: h2.publicKey,
      [RECIPIENT_RECOVERY]: recovery.publicKey,
      [RECIPIENT_WHISTLEBLOWER]: wb.publicKey,
    };

    // 1. Hinweisgeber reicht die Meldung ein (clientseitig verschlüsselt).
    const report = await encryptForRecipients(
      'Verdacht auf Bestechung im Einkauf — äöüß.',
      recipients,
    );
    expect(await decryptFromRecipient(report, 'h1', h1.publicKey, h1.privateKey)).toContain(
      'Bestechung',
    );
    expect(await decryptFromRecipient(report, 'h2', h2.publicKey, h2.privateKey)).toContain(
      'Bestechung',
    );
    expect(
      await decryptFromRecipient(
        report,
        RECIPIENT_RECOVERY,
        recovery.publicKey,
        recovery.privateKey,
      ),
    ).toContain('Bestechung');
    // Hinweisgeber kann die eigene Meldung erneut lesen (Token -> Keypaar).
    const wbAgain = await deriveWhistleblowerKeyPair(token);
    expect(
      await decryptFromRecipient(
        report,
        RECIPIENT_WHISTLEBLOWER,
        wbAgain.publicKey,
        wbAgain.privateKey,
      ),
    ).toContain('Bestechung');

    // 2. Antwort der Meldestelle (Bearbeiter h1) an dasselbe Empfängerset.
    const officeReply = await encryptForRecipients('Bitte den Zeitraum präzisieren.', recipients);
    expect(
      await decryptFromRecipient(officeReply, RECIPIENT_WHISTLEBLOWER, wb.publicKey, wb.privateKey),
    ).toContain('Zeitraum');
    expect(await decryptFromRecipient(officeReply, 'h2', h2.publicKey, h2.privateKey)).toContain(
      'Zeitraum',
    );

    // 3. Antwort des Hinweisgebers (mit aus Token abgeleitetem Keypaar).
    const wbReply = await encryptForRecipients('Es war im März letzten Jahres.', recipients);
    expect(await decryptFromRecipient(wbReply, 'h1', h1.publicKey, h1.privateKey)).toContain(
      'März',
    );

    // 4. Ein Unberechtigter (fremdes Keypaar) kann nichts lesen.
    const outsider = await generateKeyPair();
    await expect(
      decryptFromRecipient(report, 'h1', outsider.publicKey, outsider.privateKey),
    ).rejects.toThrow();
  });

  it('Recovery-Re-Wrap gewährt einem neuen Bearbeiter Zugriff (ohne Server-Klartext)', async () => {
    const h1 = await generateKeyPair();
    const recovery = await generateKeyPair();
    const newHandler = await generateKeyPair(); // nachträglich hinzugefügt, kein Wrap

    const plaintext = 'Nur an h1 + Recovery adressiert.';
    const ct = await encryptForRecipients(plaintext, {
      h1: h1.publicKey,
      [RECIPIENT_RECOVERY]: recovery.publicKey,
    });

    // Neuer Bearbeiter hat (noch) keinen Wrap.
    expect(ct.wraps.newH).toBeUndefined();

    // Recovery entpackt den Inhaltsschlüssel und verpackt ihn für den neuen
    // Bearbeiter neu (rein clientseitig: sealOpen -> sealTo).
    const recoveryWrap = ct.wraps[RECIPIENT_RECOVERY];
    if (!recoveryWrap) throw new Error('kein Recovery-Wrap');
    const contentKey = await sealOpen(recoveryWrap, recovery.publicKey, recovery.privateKey);
    const rewrapped = await sealTo(contentKey, newHandler.publicKey);

    // Mit dem neuen Wrap kann der neue Bearbeiter den Fall jetzt entschlüsseln.
    const restored = { ...ct, wraps: { ...ct.wraps, newH: rewrapped } };
    expect(
      await decryptFromRecipient(restored, 'newH', newHandler.publicKey, newHandler.privateKey),
    ).toBe(plaintext);
  });
});
