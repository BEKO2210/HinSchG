import { randomBytes } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  decryptPayload,
  encryptPayload,
  generateReceiptToken,
  hashPassword,
  hashToken,
  normalizeReceiptToken,
  resetMasterKeyCache,
  tokenBlindIndex,
  verifyPassword,
  verifyToken,
} from './crypto';

beforeAll(() => {
  // Deterministischer, gültiger 32-Byte-Master-Key für die Tests.
  process.env.MASTER_ENCRYPTION_KEY = Buffer.from(randomBytes(32)).toString('base64');
  resetMasterKeyCache();
});

describe('generateReceiptToken', () => {
  it('hat das erwartete Gruppenformat (8 x 4 Base32-Zeichen)', () => {
    const token = generateReceiptToken();
    expect(token).toMatch(/^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/);
  });

  it('liefert >= 128 Bit Entropie (32 Base32-Zeichen = 160 Bit)', () => {
    const normalized = normalizeReceiptToken(generateReceiptToken());
    expect(normalized).toHaveLength(32);
    expect(normalized.length * 5).toBeGreaterThanOrEqual(128);
  });

  it('erzeugt eindeutige Tokens', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateReceiptToken()));
    expect(tokens.size).toBe(500);
  });
});

describe('hashToken / verifyToken', () => {
  it('verifiziert den korrekten Token, unabhängig von Formatierung', () => {
    const token = generateReceiptToken();
    const hash = hashToken(token);
    expect(verifyToken(token, hash)).toBe(true);
    // Eingabe ohne Bindestriche und in Kleinschreibung muss ebenfalls passen.
    expect(verifyToken(token.replace(/-/g, '').toLowerCase(), hash)).toBe(true);
  });

  it('lehnt einen falschen Token ab', () => {
    const hash = hashToken(generateReceiptToken());
    expect(verifyToken(generateReceiptToken(), hash)).toBe(false);
  });

  it('speichert den Klartext-Token nicht im Hash', () => {
    const token = generateReceiptToken();
    const hash = hashToken(token);
    expect(hash).not.toContain(normalizeReceiptToken(token));
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('lehnt strukturell ungültige Hashes ab (kein Wurf)', () => {
    // Falsche Teil-Anzahl / falscher Algorithmus-Marker.
    expect(verifyToken('x', 'nur-müll')).toBe(false);
    expect(verifyToken('x', '$argon2d$v=19$m=1,t=1,p=1$c2FsdA$aGFzaA')).toBe(false);
    // Ungültiger Parameter-Block (Regex matcht nicht).
    expect(verifyToken('x', '$argon2id$v=19$m=x,t=y,p=z$c2FsdA$aGFzaA')).toBe(false);
    // Ungültiges Base64 in Salt/Hash -> base64.decode wirft -> false.
    expect(verifyToken('x', '$argon2id$v=19$m=1,t=1,p=1$!!§§$!!§§')).toBe(false);
  });
});

describe('tokenBlindIndex', () => {
  it('ist deterministisch und unabhängig von der Formatierung', () => {
    const token = generateReceiptToken();
    const index = tokenBlindIndex(token);
    expect(index).toMatch(/^[0-9a-f]{64}$/); // HMAC-SHA256 hex
    expect(tokenBlindIndex(token.replace(/-/g, '').toLowerCase())).toBe(index);
  });

  it('liefert für verschiedene Tokens verschiedene Indizes', () => {
    expect(tokenBlindIndex(generateReceiptToken())).not.toBe(
      tokenBlindIndex(generateReceiptToken()),
    );
  });

  it('enthält den Klartext-Token nicht', () => {
    const token = generateReceiptToken();
    expect(tokenBlindIndex(token)).not.toContain(normalizeReceiptToken(token));
  });
});

describe('hashPassword / verifyPassword', () => {
  it('verifiziert das korrekte Passwort', () => {
    const hash = hashPassword('korrektes-Passwort-123');
    expect(verifyPassword('korrektes-Passwort-123', hash)).toBe(true);
  });

  it('lehnt ein falsches Passwort ab', () => {
    const hash = hashPassword('korrektes-Passwort-123');
    expect(verifyPassword('falsches-Passwort', hash)).toBe(false);
  });

  it('erzeugt durch zufälliges Salt unterschiedliche Hashes', () => {
    expect(hashPassword('gleiches-Passwort')).not.toBe(hashPassword('gleiches-Passwort'));
  });

  it('lehnt einen kaputten Hash-String ab', () => {
    expect(verifyPassword('egal', 'kein-gültiger-hash')).toBe(false);
  });
});

describe('encryptPayload / decryptPayload', () => {
  it('Roundtrip ergibt das Original (inkl. Unicode)', () => {
    const plaintext = 'Vertrauliche Meldung: Müller & Co. 🕵️ — Zeile 2.';
    expect(decryptPayload(encryptPayload(plaintext))).toBe(plaintext);
  });

  it('erzeugt bei gleichem Klartext unterschiedliche Ciphertexte (zufällige Nonce)', () => {
    const plaintext = 'identischer Inhalt';
    expect(encryptPayload(plaintext)).not.toBe(encryptPayload(plaintext));
  });

  it('wirft bei manipuliertem Ciphertext (Poly1305-Tag)', () => {
    const encoded = encryptPayload('geheim');
    const bytes = Buffer.from(encoded, 'base64');
    const last = bytes.length - 1;
    bytes[last] = (bytes[last] ?? 0) ^ 0xff; // letztes Byte (Teil des Auth-Tags) kippen
    const tampered = bytes.toString('base64');
    expect(() => decryptPayload(tampered)).toThrow();
  });

  it('wirft bei zu kurzem Ciphertext (kürzer als die Nonce)', () => {
    // 4 Byte base64 -> deutlich kürzer als die 24-Byte-Nonce.
    expect(() => decryptPayload(Buffer.from([1, 2, 3, 4]).toString('base64'))).toThrow('zu kurz');
  });
});

describe('getMasterKey — Fehlkonfiguration', () => {
  const validKey = process.env.MASTER_ENCRYPTION_KEY;
  afterEach(() => {
    // Gültigen Key + Cache für die übrigen Tests wiederherstellen.
    process.env.MASTER_ENCRYPTION_KEY = validKey;
    resetMasterKeyCache();
  });

  it('wirft, wenn der Master-Key fehlt', () => {
    delete process.env.MASTER_ENCRYPTION_KEY;
    resetMasterKeyCache();
    expect(() => encryptPayload('x')).toThrow('nicht gesetzt');
  });

  it('wirft bei falscher Schlüssel-Länge', () => {
    process.env.MASTER_ENCRYPTION_KEY = Buffer.from(randomBytes(16)).toString('base64');
    resetMasterKeyCache();
    expect(() => encryptPayload('x')).toThrow('32 Byte');
  });

  it('wirft bei ungültigem Base64', () => {
    process.env.MASTER_ENCRYPTION_KEY = '!!! kein base64 €€€';
    resetMasterKeyCache();
    expect(() => encryptPayload('x')).toThrow('Base64');
  });
});
