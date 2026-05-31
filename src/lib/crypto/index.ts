// HinSchG — Krypto-Modul (Stufe 1: "verschluesselt at rest + datenminimiert")
//
// Siehe ARCHITECTURE.md Abschnitt 5. Es werden ausschliesslich auditierte
// Primitive verwendet (kein Eigenbau):
//   - XChaCha20-Poly1305 (@noble/ciphers) fuer die Inhaltsverschluesselung
//   - Argon2id (@noble/hashes) fuer Passwort- und Token-Hashing
//   - Base32/Base64 (@scure/base) fuer die Kodierung
//
// WICHTIG: Receipt-Tokens werden NIE im Klartext gespeichert, nur als
// Argon2id-Hash. Der MASTER_ENCRYPTION_KEY liegt ausschliesslich in der
// Umgebung, niemals in der Datenbank.

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { argon2id } from '@noble/hashes/argon2';
import { hkdf } from '@noble/hashes/hkdf';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { base32, base64 } from '@scure/base';

export const CRYPTO_LEVEL = 1 as const;

// --- Argon2id-Parameter ------------------------------------------------------
// Orientiert an den OWASP-Empfehlungen fuer Argon2id (m=19 MiB, t=2, p=1).
const ARGON2_PARAMS = {
  m: 19456, // Speicher in KiB (~19 MiB)
  t: 2, // Iterationen
  p: 1, // Parallelitaet
  dkLen: 32, // Laenge des abgeleiteten Schluessels/Hashes
} as const;

const ARGON2_VERSION = 19; // 0x13

// --- Receipt-Token -----------------------------------------------------------
// 20 Zufallsbytes => 160 Bit Entropie (> 128 Bit gefordert). Base32-kodiert
// ergibt das exakt 32 Zeichen, die in 8 gut lesbare Vierergruppen formatiert
// werden (Format XXXX-XXXX-...). Mehr Gruppen als das Minimalbeispiel, damit
// die Entropie-Anforderung sicher erfuellt ist.
const TOKEN_ENTROPY_BYTES = 20;
const TOKEN_GROUP_SIZE = 4;

/**
 * Erzeugt einen Receipt-Token mit >= 128 Bit Entropie im Format
 * XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX (Base32, RFC 4648).
 */
export function generateReceiptToken(): string {
  const raw = new Uint8Array(randomBytes(TOKEN_ENTROPY_BYTES));
  const encoded = base32.encode(raw); // 32 Zeichen, ohne Padding (20 ist Vielfaches von 5)
  const groups: string[] = [];
  for (let i = 0; i < encoded.length; i += TOKEN_GROUP_SIZE) {
    groups.push(encoded.slice(i, i + TOKEN_GROUP_SIZE));
  }
  return groups.join('-');
}

/**
 * Normalisiert einen vom Nutzer eingegebenen Token (entfernt Bindestriche/
 * Leerzeichen, Grossschreibung), damit Hashing/Verify unabhaengig von der
 * Formatierung der Eingabe sind.
 */
export function normalizeReceiptToken(token: string): string {
  return token.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

// --- Argon2id-Hashing (PHC-aehnliches Format) --------------------------------
// Format: $argon2id$v=19$m=<m>,t=<t>,p=<p>$<saltB64>$<hashB64>
// Salt und Parameter werden mitgespeichert, damit Verify ohne externe Werte
// moeglich ist.

function argon2Hash(secret: string, salt: Uint8Array): Uint8Array {
  return argon2id(utf8ToBytes(secret), salt, {
    m: ARGON2_PARAMS.m,
    t: ARGON2_PARAMS.t,
    p: ARGON2_PARAMS.p,
    dkLen: ARGON2_PARAMS.dkLen,
    version: ARGON2_VERSION,
  });
}

function encodeArgon2(secret: string): string {
  const salt = new Uint8Array(randomBytes(16));
  const hash = argon2Hash(secret, salt);
  const { m, t, p } = ARGON2_PARAMS;
  return `$argon2id$v=${ARGON2_VERSION}$m=${m},t=${t},p=${p}$${base64.encode(salt)}$${base64.encode(hash)}`;
}

function verifyArgon2(secret: string, encoded: string): boolean {
  const parts = encoded.split('$');
  // ['', 'argon2id', 'v=19', 'm=..,t=..,p=..', '<salt>', '<hash>']
  if (parts.length !== 6 || parts[1] !== 'argon2id') {
    return false;
  }
  const params = parts[3] ?? '';
  const match = /^m=(\d+),t=(\d+),p=(\d+)$/.exec(params);
  if (!match) {
    return false;
  }
  const m = Number(match[1]);
  const t = Number(match[2]);
  const p = Number(match[3]);
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = base64.decode(parts[4] ?? '');
    expected = base64.decode(parts[5] ?? '');
  } catch {
    return false;
  }
  const actual = argon2id(utf8ToBytes(secret), salt, {
    m,
    t,
    p,
    dkLen: expected.length,
    version: ARGON2_VERSION,
  });
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

/** Hasht ein Passwort mit Argon2id (inkl. Salt + Parametern). */
export function hashPassword(password: string): string {
  return encodeArgon2(password);
}

/** Prueft ein Passwort gegen einen Argon2id-Hash (konstante Zeit). */
export function verifyPassword(password: string, hash: string): boolean {
  return verifyArgon2(password, hash);
}

/** Hasht einen Receipt-Token mit Argon2id (Token wird vorher normalisiert). */
export function hashToken(token: string): string {
  return encodeArgon2(normalizeReceiptToken(token));
}

/** Prueft einen Receipt-Token gegen seinen Argon2id-Hash (konstante Zeit). */
export function verifyToken(token: string, hash: string): boolean {
  return verifyArgon2(normalizeReceiptToken(token), hash);
}

// --- Symmetrische Verschluesselung (XChaCha20-Poly1305) ----------------------

const KEY_LENGTH = 32;
const NONCE_LENGTH = 24;

let cachedKey: Uint8Array | null = null;

/**
 * Liest den Master-Key aus der Umgebung (Base64, 32 Byte). Wirft, wenn er
 * fehlt oder ungueltig ist — wir wollen keinen stillen Betrieb ohne
 * Verschluesselung.
 */
function getMasterKey(): Uint8Array {
  if (cachedKey) {
    return cachedKey;
  }
  const raw = process.env.MASTER_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('MASTER_ENCRYPTION_KEY ist nicht gesetzt.');
  }
  let key: Uint8Array;
  try {
    key = base64.decode(raw);
  } catch {
    throw new Error('MASTER_ENCRYPTION_KEY ist kein gueltiger Base64-Wert.');
  }
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `MASTER_ENCRYPTION_KEY muss 32 Byte lang sein (Base64), ist aber ${key.length} Byte.`,
    );
  }
  cachedKey = key;
  return key;
}

/** Nur fuer Tests: setzt die gecachten Schluessel zurueck. */
export function resetMasterKeyCache(): void {
  cachedKey = null;
  cachedBlindIndexKey = null;
}

// --- Blind Index fuer Receipt-Tokens -----------------------------------------
// Tokens werden weiterhin ausschliesslich als Argon2id-Hash verifiziert. Fuer
// das schnelle Auffinden des richtigen Falls beim Login brauchen wir aber einen
// deterministischen Schluessel — ein O(n)-Durchlauf mit Argon2id pro Fall waere
// nicht praktikabel. Der Blind-Index ist ein geschluesselter HMAC ueber den
// (160-Bit-)Token:
//   - Der HMAC-Schluessel wird via HKDF aus dem MASTER_ENCRYPTION_KEY abgeleitet
//     (Domain-Trennung), liegt also NICHT in der Datenbank.
//   - Da der Token >= 160 Bit Entropie hat, bleibt er selbst bei Kenntnis von
//     DB UND Schluessel praktisch nicht brute-forcebar.

let cachedBlindIndexKey: Uint8Array | null = null;

function getBlindIndexKey(): Uint8Array {
  if (cachedBlindIndexKey) {
    return cachedBlindIndexKey;
  }
  cachedBlindIndexKey = hkdf(
    sha256,
    getMasterKey(),
    undefined,
    utf8ToBytes('hinschg/token-blind-index/v1'),
    32,
  );
  return cachedBlindIndexKey;
}

/**
 * Deterministischer Blind-Index eines Receipt-Tokens (Hex-HMAC-SHA256).
 * Wird als indizierte Spalte gespeichert, um beim Login O(1) den passenden
 * Fall zu finden. Kein Ersatz fuer die Argon2id-Verifikation.
 */
export function tokenBlindIndex(token: string): string {
  const mac = hmac(sha256, getBlindIndexKey(), utf8ToBytes(normalizeReceiptToken(token)));
  return bytesToHex(mac);
}

/**
 * Verschluesselt einen UTF-8-String mit XChaCha20-Poly1305.
 * Rueckgabe: Base64 von (24-Byte-Nonce || Ciphertext+Tag).
 */
export function encryptPayload(plaintext: string): string {
  const key = getMasterKey();
  const nonce = new Uint8Array(randomBytes(NONCE_LENGTH));
  const cipher = xchacha20poly1305(key, nonce);
  const ciphertext = cipher.encrypt(utf8ToBytes(plaintext));
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, nonce.length);
  return base64.encode(combined);
}

/**
 * Entschluesselt einen mit {@link encryptPayload} erzeugten Wert.
 * Wirft bei manipuliertem/ungueltigem Ciphertext (Poly1305-Tag-Pruefung).
 */
export function decryptPayload(encoded: string): string {
  const key = getMasterKey();
  const combined = base64.decode(encoded);
  if (combined.length <= NONCE_LENGTH) {
    throw new Error('Ungueltiger Ciphertext: zu kurz.');
  }
  const nonce = combined.slice(0, NONCE_LENGTH);
  const ciphertext = combined.slice(NONCE_LENGTH);
  const cipher = xchacha20poly1305(key, nonce);
  const plaintext = cipher.decrypt(ciphertext);
  return new TextDecoder().decode(plaintext);
}
