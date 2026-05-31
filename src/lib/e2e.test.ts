import { describe, expect, it } from 'vitest';
import {
  decryptFromRecipient,
  decryptPrivateKey,
  deriveWhistleblowerKeyPair,
  encryptForRecipients,
  encryptPrivateKey,
  generateKeyPair,
  getSodium,
  sealOpen,
  sealTo,
} from './e2e';

describe('generateKeyPair', () => {
  it('erzeugt unterschiedliche X25519-Keypaare (32-Byte Public Key)', async () => {
    const s = await getSodium();
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    expect(a.publicKey).not.toBe(b.publicKey);
    expect(s.from_base64(a.publicKey, s.base64_variants.ORIGINAL)).toHaveLength(32);
  });
});

describe('encryptPrivateKey / decryptPrivateKey', () => {
  it('Roundtrip mit korrektem Passwort', async () => {
    const kp = await generateKeyPair();
    const enc = await encryptPrivateKey(kp.privateKey, 'mein-sicheres-Passwort');
    expect(await decryptPrivateKey(enc, 'mein-sicheres-Passwort')).toBe(kp.privateKey);
  });

  it('schlaegt mit falschem Passwort fehl', async () => {
    const kp = await generateKeyPair();
    const enc = await encryptPrivateKey(kp.privateKey, 'richtig');
    await expect(decryptPrivateKey(enc, 'falsch')).rejects.toThrow();
  });

  it('enthaelt den privaten Schluessel nicht im Klartext', async () => {
    const kp = await generateKeyPair();
    const enc = await encryptPrivateKey(kp.privateKey, 'pw');
    expect(JSON.stringify(enc)).not.toContain(kp.privateKey);
  });
});

describe('Sealed Box', () => {
  it('Roundtrip an einen Empfaenger', async () => {
    const s = await getSodium();
    const kp = await generateKeyPair();
    const sealed = await sealTo(s.from_string('geheime Nachricht'), kp.publicKey);
    const opened = await sealOpen(sealed, kp.publicKey, kp.privateKey);
    expect(s.to_string(opened)).toBe('geheime Nachricht');
  });

  it('ein fremder Schluessel kann nicht oeffnen', async () => {
    const s = await getSodium();
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const sealed = await sealTo(s.from_string('x'), a.publicKey);
    await expect(sealOpen(sealed, b.publicKey, b.privateKey)).rejects.toThrow();
  });
});

describe('encryptForRecipients (Multi-Recipient)', () => {
  it('jeder berechtigte Empfaenger kann entschluesseln', async () => {
    const h1 = await generateKeyPair();
    const h2 = await generateKeyPair();
    const recovery = await generateKeyPair();
    const plaintext = 'Vertrauliche Meldung über Verstöße — äöüß.';
    const ct = await encryptForRecipients(plaintext, {
      h1: h1.publicKey,
      h2: h2.publicKey,
      RECOVERY: recovery.publicKey,
    });
    expect(await decryptFromRecipient(ct, 'h1', h1.publicKey, h1.privateKey)).toBe(plaintext);
    expect(await decryptFromRecipient(ct, 'h2', h2.publicKey, h2.privateKey)).toBe(plaintext);
    expect(
      await decryptFromRecipient(ct, 'RECOVERY', recovery.publicKey, recovery.privateKey),
    ).toBe(plaintext);
  });

  it('Inhalt erscheint nicht im Klartext im Ciphertext', async () => {
    const h1 = await generateKeyPair();
    const ct = await encryptForRecipients('streng geheim', { h1: h1.publicKey });
    expect(JSON.stringify(ct)).not.toContain('streng geheim');
  });

  it('falscher Empfaenger-Schluessel scheitert; unbekannte ID wirft', async () => {
    const h1 = await generateKeyPair();
    const other = await generateKeyPair();
    const ct = await encryptForRecipients('x', { h1: h1.publicKey });
    await expect(
      decryptFromRecipient(ct, 'h1', other.publicKey, other.privateKey),
    ).rejects.toThrow();
    await expect(decryptFromRecipient(ct, 'nope', h1.publicKey, h1.privateKey)).rejects.toThrow();
  });
});

describe('deriveWhistleblowerKeyPair', () => {
  it('ist deterministisch und formatunabhaengig', async () => {
    const token = 'ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567';
    const a = await deriveWhistleblowerKeyPair(token);
    const b = await deriveWhistleblowerKeyPair(token.toLowerCase().replace(/-/g, ''));
    expect(a.publicKey).toBe(b.publicKey);
  });

  it('unterschiedliche Tokens ergeben unterschiedliche Keypaare', async () => {
    const a = await deriveWhistleblowerKeyPair('AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA');
    const b = await deriveWhistleblowerKeyPair('BBBB-BBBB-BBBB-BBBB-BBBB-BBBB-BBBB-BBBB');
    expect(a.publicKey).not.toBe(b.publicKey);
  });

  it('Meldestelle kann ohne Token an den Hinweisgeber verschluesseln; WB oeffnet via Token', async () => {
    const s = await getSodium();
    const token = 'WXYZ-2345-6QRS-TUVW-ABCD-EFGH-IJKL-MNOP';
    const wb = await deriveWhistleblowerKeyPair(token);
    // Meldestelle kennt nur den Public Key (z. B. aus der DB).
    const sealed = await sealTo(s.from_string('Antwort der Meldestelle'), wb.publicKey);
    // Hinweisgeber leitet das Keypaar erneut aus dem Token ab und oeffnet.
    const again = await deriveWhistleblowerKeyPair(token);
    expect(s.to_string(await sealOpen(sealed, again.publicKey, again.privateKey))).toBe(
      'Antwort der Meldestelle',
    );
  });
});
