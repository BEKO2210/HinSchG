// HinSchG — Stufe-2-Krypto (Ende-zu-Ende / Zero-Knowledge)
//
// Isomorph (Browser + Node) auf Basis von libsodium-wrappers-sumo (auditierte
// Primitive). Ziel: Der Server sieht zu keinem Zeitpunkt Klartext.
//
// Bausteine:
//   - X25519-Keypaar je Bearbeiter (privater Key passwortverschluesselt)
//   - Sealed Box (crypto_box_seal): anonyme Verschluesselung an einen Public Key
//   - Hybrid-Multi-Recipient: zufaelliger Inhaltsschluessel verschluesselt den
//     Inhalt (XChaCha20-Poly1305/secretbox), pro Empfaenger wird der
//     Inhaltsschluessel per Sealed Box verpackt
//   - Token-abgeleitetes Keypaar des Hinweisgebers (deterministisch aus dem
//     Receipt-Token) fuer Antworten der Meldestelle an den Hinweisgeber
//
// WICHTIG: Diese Schicht ist erst nach einem externen Security-Audit als
// "Zero-Knowledge" zu kommunizieren.

import _sodium from 'libsodium-wrappers-sumo';
import { base32 } from '@scure/base';

let ready: Promise<typeof _sodium> | null = null;

/** Initialisiert libsodium (WASM) und gibt die Instanz zurueck. */
export async function getSodium(): Promise<typeof _sodium> {
  if (!ready) {
    ready = _sodium.ready.then(() => _sodium);
  }
  return ready;
}

// --- Kodierung ---------------------------------------------------------------
function b64(s: typeof _sodium, bytes: Uint8Array): string {
  return s.to_base64(bytes, s.base64_variants.ORIGINAL);
}
function unb64(s: typeof _sodium, text: string): Uint8Array {
  return s.from_base64(text, s.base64_variants.ORIGINAL);
}

export interface KeyPair {
  publicKey: string; // base64
  privateKey: string; // base64
}

/** Erzeugt ein X25519-Keypaar (fuer crypto_box / Sealed Box). */
export async function generateKeyPair(): Promise<KeyPair> {
  const s = await getSodium();
  const kp = s.crypto_box_keypair();
  return { publicKey: b64(s, kp.publicKey), privateKey: b64(s, kp.privateKey) };
}

// --- Passwortgeschuetzter privater Schluessel --------------------------------
// Der private Key wird mit einem aus dem Passwort via Argon2id (crypto_pwhash)
// abgeleiteten Schluessel symmetrisch verschluesselt. Salt + Parameter werden
// mitgespeichert.

export interface EncryptedKey {
  v: 2;
  salt: string;
  nonce: string;
  ct: string;
  ops: number;
  mem: number;
}

export async function encryptPrivateKey(
  privateKey: string,
  password: string,
): Promise<EncryptedKey> {
  const s = await getSodium();
  const salt = s.randombytes_buf(s.crypto_pwhash_SALTBYTES);
  const ops = s.crypto_pwhash_OPSLIMIT_MODERATE;
  const mem = s.crypto_pwhash_MEMLIMIT_MODERATE;
  const key = s.crypto_pwhash(
    s.crypto_secretbox_KEYBYTES,
    password,
    salt,
    ops,
    mem,
    s.crypto_pwhash_ALG_ARGON2ID13,
  );
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);
  const ct = s.crypto_secretbox_easy(unb64(s, privateKey), nonce, key);
  return { v: 2, salt: b64(s, salt), nonce: b64(s, nonce), ct: b64(s, ct), ops, mem };
}

export async function decryptPrivateKey(enc: EncryptedKey, password: string): Promise<string> {
  const s = await getSodium();
  const key = s.crypto_pwhash(
    s.crypto_secretbox_KEYBYTES,
    password,
    unb64(s, enc.salt),
    enc.ops,
    enc.mem,
    s.crypto_pwhash_ALG_ARGON2ID13,
  );
  const pt = s.crypto_secretbox_open_easy(unb64(s, enc.ct), unb64(s, enc.nonce), key);
  return b64(s, pt);
}

// --- Sealed Box (anonyme Verschluesselung an einen Public Key) ----------------
export async function sealTo(message: Uint8Array, recipientPublicKey: string): Promise<string> {
  const s = await getSodium();
  return b64(s, s.crypto_box_seal(message, unb64(s, recipientPublicKey)));
}

export async function sealOpen(
  sealed: string,
  publicKey: string,
  privateKey: string,
): Promise<Uint8Array> {
  const s = await getSodium();
  return s.crypto_box_seal_open(unb64(s, sealed), unb64(s, publicKey), unb64(s, privateKey));
}

// --- Hybrid-Multi-Recipient ---------------------------------------------------
// Inhalt einmal mit zufaelligem Schluessel (secretbox) verschluesseln, den
// Schluessel pro Empfaenger per Sealed Box verpacken.

export interface MultiRecipientCiphertext {
  nonce: string;
  content: string;
  /** Empfaenger-ID (z. B. handlerId oder "RECOVERY") -> verpackter Inhaltsschluessel */
  wraps: Record<string, string>;
}

export async function encryptForRecipients(
  plaintext: string,
  recipients: Record<string, string>, // id -> publicKey(base64)
): Promise<MultiRecipientCiphertext> {
  const s = await getSodium();
  const contentKey = s.randombytes_buf(s.crypto_secretbox_KEYBYTES);
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);
  const content = s.crypto_secretbox_easy(s.from_string(plaintext), nonce, contentKey);
  const wraps: Record<string, string> = {};
  for (const [id, pub] of Object.entries(recipients)) {
    wraps[id] = b64(s, s.crypto_box_seal(contentKey, unb64(s, pub)));
  }
  return { nonce: b64(s, nonce), content: b64(s, content), wraps };
}

export async function decryptFromRecipient(
  payload: MultiRecipientCiphertext,
  recipientId: string,
  publicKey: string,
  privateKey: string,
): Promise<string> {
  const s = await getSodium();
  const wrap = payload.wraps[recipientId];
  if (!wrap) {
    throw new Error('Kein Inhaltsschluessel fuer diesen Empfaenger.');
  }
  const contentKey = s.crypto_box_seal_open(
    unb64(s, wrap),
    unb64(s, publicKey),
    unb64(s, privateKey),
  );
  const pt = s.crypto_secretbox_open_easy(
    unb64(s, payload.content),
    unb64(s, payload.nonce),
    contentKey,
  );
  return s.to_string(pt);
}

// --- Token-abgeleitetes Keypaar des Hinweisgebers -----------------------------
// Deterministisch aus dem (normalisierten) Receipt-Token. So kann die
// Meldestelle Antworten an den Public Key verschluesseln, ohne den Token zu
// kennen; der Hinweisgeber leitet den privaten Key bei Bedarf erneut aus dem
// Token ab.

function normalizeToken(token: string): string {
  return token.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export async function deriveWhistleblowerKeyPair(token: string): Promise<KeyPair> {
  const s = await getSodium();
  // 32-Byte-Seed aus dem Token; Domain-Trennung via Hash-Key.
  const seed = s.crypto_generichash(
    s.crypto_box_SEEDBYTES,
    s.from_string(normalizeToken(token)),
    s.from_string('hinschg/wb-keypair/v2'),
  );
  const kp = s.crypto_box_seed_keypair(seed);
  return { publicKey: b64(s, kp.publicKey), privateKey: b64(s, kp.privateKey) };
}

// --- Browser-sichere Token-Helfer (Stufe 2) ----------------------------------
// Der Receipt-Token wird im Browser erzeugt; der Server sieht ihn nie. Lookup-
// und Verify-Hash werden ebenfalls clientseitig berechnet und an den Server
// uebergeben (erfuellen @unique/not-null, ohne den Token preiszugeben).

const TOKEN_GROUP_SIZE = 4;

// sessionStorage-Schlüssel, unter dem das Postfach den Receipt-Token im Tab
// hält (nur Stufe 2, zur clientseitigen Entschlüsselung).
export const WB_TOKEN_STORAGE_KEY = 'hinschg_wb_token';

/** Erzeugt einen Receipt-Token (160 Bit) im Format XXXX-…-XXXX (Base32). */
export async function generateReceiptToken(): Promise<string> {
  const s = await getSodium();
  const encoded = base32.encode(s.randombytes_buf(20)); // 32 Zeichen
  const groups: string[] = [];
  for (let i = 0; i < encoded.length; i += TOKEN_GROUP_SIZE) {
    groups.push(encoded.slice(i, i + TOKEN_GROUP_SIZE));
  }
  return groups.join('-');
}

async function tokenHashWith(token: string, context: string): Promise<string> {
  const s = await getSodium();
  return b64(
    s,
    s.crypto_generichash(32, s.from_string(normalizeToken(token)), s.from_string(context)),
  );
}

/** Deterministischer Lookup-Hash des Tokens (zum Auffinden des Falls). */
export function tokenLookupHash(token: string): Promise<string> {
  return tokenHashWith(token, 'hinschg/token-lookup/v2');
}

/** Zweiter, vom Lookup verschiedener Hash (erfuellt die @unique-Spalte tokenHash). */
export function tokenVerifyHash(token: string): Promise<string> {
  return tokenHashWith(token, 'hinschg/token-verify/v2');
}
