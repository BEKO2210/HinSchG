import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
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
} from './index';

beforeAll(() => {
  // Deterministischer, gueltiger 32-Byte-Master-Key fuer die Tests.
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
  it('verifiziert den korrekten Token, unabhaengig von Formatierung', () => {
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
});

describe('tokenBlindIndex', () => {
  it('ist deterministisch und unabhaengig von der Formatierung', () => {
    const token = generateReceiptToken();
    const index = tokenBlindIndex(token);
    expect(index).toMatch(/^[0-9a-f]{64}$/); // HMAC-SHA256 hex
    expect(tokenBlindIndex(token.replace(/-/g, '').toLowerCase())).toBe(index);
  });

  it('liefert fuer verschiedene Tokens verschiedene Indizes', () => {
    expect(tokenBlindIndex(generateReceiptToken())).not.toBe(
      tokenBlindIndex(generateReceiptToken()),
    );
  });

  it('enthaelt den Klartext-Token nicht', () => {
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

  it('erzeugt durch zufaelliges Salt unterschiedliche Hashes', () => {
    expect(hashPassword('gleiches-Passwort')).not.toBe(hashPassword('gleiches-Passwort'));
  });

  it('lehnt einen kaputten Hash-String ab', () => {
    expect(verifyPassword('egal', 'kein-gueltiger-hash')).toBe(false);
  });
});

describe('encryptPayload / decryptPayload', () => {
  it('Roundtrip ergibt das Original (inkl. Unicode)', () => {
    const plaintext = 'Vertrauliche Meldung: Müller & Co. 🕵️ — Zeile 2.';
    expect(decryptPayload(encryptPayload(plaintext))).toBe(plaintext);
  });

  it('erzeugt bei gleichem Klartext unterschiedliche Ciphertexte (zufaellige Nonce)', () => {
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
});
