// HinSchG — Krypto-Modul (Stufe 1)
//
// Phase 0: nur Platzhalter. Die echten Primitive folgen in Phase 1 gemaess
// ARCHITECTURE.md Abschnitt 5 und werden mit Unit-Tests abgesichert:
//   - generateReceiptToken(): >=128 Bit Entropie, Format XXXX-XXXX-XXXX-XXXX
//   - hashToken / verifyToken: Argon2id
//   - encryptPayload / decryptPayload: XChaCha20-Poly1305 mit MASTER_ENCRYPTION_KEY
//   - hashPassword / verifyPassword: Argon2id
//
// WICHTIG: Auditierte Primitive verwenden (libsodium / @noble), kein Eigenbau.

export const CRYPTO_LEVEL = 1 as const;
