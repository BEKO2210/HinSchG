import { describe, expect, it } from 'vitest';
import {
  decryptAttachment,
  decryptFromRecipient,
  decryptPrivateKey,
  deriveWhistleblowerKeyPair,
  encryptAttachment,
  encryptForRecipients,
  encryptPrivateKey,
  generateKeyPair,
  generateReceiptToken,
  getSodium,
  sealOpen,
  sealTo,
  tokenLookupHash,
  tokenVerifyHash,
} from './e2e';

describe('generateReceiptToken / Token-Hashes (Browser-Helfer)', () => {
  it('erzeugt das erwartete Token-Format (8 x 4 Base32)', async () => {
    expect(await generateReceiptToken()).toMatch(/^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/);
  });

  it('Lookup- und Verify-Hash sind deterministisch, formatunabhängig und verschieden', async () => {
    const token = 'ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567';
    const lookup = await tokenLookupHash(token);
    const verify = await tokenVerifyHash(token);
    expect(lookup).toBe(await tokenLookupHash(token.toLowerCase().replace(/-/g, '')));
    expect(lookup).not.toBe(verify);
    expect(lookup).not.toContain(token.replace(/-/g, ''));
  });
});

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

describe('Anhang-Verschluesselung (Multi-Recipient, binaer)', () => {
  it('Roundtrip: Empfaenger entschluesselt Datei + Dateiname', async () => {
    const a = await generateKeyPair();
    const wb = await generateKeyPair();
    const bytes = new Uint8Array([0, 1, 2, 3, 250, 255, 128]);
    const enc = await encryptAttachment(bytes, 'geheim.pdf', {
      h_a: a.publicKey,
      WB: wb.publicKey,
    });
    const out = await decryptAttachment(enc, enc.wraps.h_a!, a.publicKey, a.privateKey);
    expect(Array.from(out.bytes)).toEqual(Array.from(bytes));
    expect(out.filename).toBe('geheim.pdf');
    // Auch der Hinweisgeber (anderer Wrap) bekommt denselben Inhalt.
    const outWb = await decryptAttachment(enc, enc.wraps.WB!, wb.publicKey, wb.privateKey);
    expect(outWb.filename).toBe('geheim.pdf');
  });

  it('ein fremdes Keypaar kann den Anhang NICHT entschluesseln', async () => {
    const a = await generateKeyPair();
    const fremd = await generateKeyPair();
    const enc = await encryptAttachment(new Uint8Array([1, 2, 3]), 'x.pdf', {
      h_a: a.publicKey,
      WB: a.publicKey,
    });
    await expect(
      decryptAttachment(enc, enc.wraps.h_a!, fremd.publicKey, fremd.privateKey),
    ).rejects.toThrow();
  });
});
