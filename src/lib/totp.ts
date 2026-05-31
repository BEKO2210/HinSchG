// HinSchG — TOTP (2FA) für Bearbeiter
//
// Nutzt otplib (Standard-TOTP, kompatibel mit Authenticator-Apps). Das Secret
// wird außerhalb dieses Moduls verschlüsselt (encryptPayload) gespeichert.

import { authenticator } from 'otplib';
import QRCode from 'qrcode';

// Eine Zeitschritt-Toleranz (+/-30 s) gegen leichte Uhren-Abweichungen.
authenticator.options = { window: 1 };

const TOTP_ISSUER = 'HinSchG';

/** Erzeugt ein neues Base32-TOTP-Secret. */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/** otpauth://-URI zum Import in eine Authenticator-App. */
export function totpKeyUri(accountName: string, secret: string): string {
  return authenticator.keyuri(accountName, TOTP_ISSUER, secret);
}

/** Prüft einen 6-stelligen TOTP-Code gegen das Secret. */
export function verifyTotp(token: string, secret: string): boolean {
  try {
    return authenticator.check(token.trim(), secret);
    // Defensive Sicherung: otplib.check wirft bei String-Eingaben nicht.
    /* v8 ignore next 3 */
  } catch {
    return false;
  }
}

/** Erzeugt eine QR-Code-Data-URL (PNG) für die otpauth-URI. */
export function totpQrDataUrl(uri: string): Promise<string> {
  return QRCode.toDataURL(uri, { margin: 1, width: 220 });
}
