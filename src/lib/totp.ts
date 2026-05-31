// HinSchG — TOTP (2FA) fuer Bearbeiter
//
// Nutzt otplib (Standard-TOTP, kompatibel mit Authenticator-Apps). Das Secret
// wird ausserhalb dieses Moduls verschluesselt (encryptPayload) gespeichert.

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

/** Prueft einen 6-stelligen TOTP-Code gegen das Secret. */
export function verifyTotp(token: string, secret: string): boolean {
  try {
    return authenticator.check(token.trim(), secret);
  } catch {
    return false;
  }
}

/** Erzeugt eine QR-Code-Data-URL (PNG) fuer die otpauth-URI. */
export function totpQrDataUrl(uri: string): Promise<string> {
  return QRCode.toDataURL(uri, { margin: 1, width: 220 });
}
