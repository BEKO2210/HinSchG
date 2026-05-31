import { authenticator } from 'otplib';
import { describe, expect, it } from 'vitest';
import { generateTotpSecret, totpKeyUri, totpQrDataUrl, verifyTotp } from './totp';

describe('generateTotpSecret', () => {
  it('erzeugt ein nicht-leeres Base32-Secret', () => {
    const secret = generateTotpSecret();
    expect(secret.length).toBeGreaterThan(0);
    // otplib nutzt RFC-4648-Base32 (A–Z, 2–7).
    expect(secret).toMatch(/^[A-Z2-7]+$/);
  });

  it('erzeugt unterschiedliche Secrets', () => {
    expect(generateTotpSecret()).not.toBe(generateTotpSecret());
  });
});

describe('totpKeyUri', () => {
  it('enthält Issuer, Account und Secret', () => {
    const secret = generateTotpSecret();
    const uri = totpKeyUri('person@example.org', secret);
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain('HinSchG');
    expect(uri).toContain('person%40example.org');
    expect(uri).toContain(`secret=${secret}`);
  });
});

describe('verifyTotp', () => {
  it('akzeptiert den aktuell gültigen Code', () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);
    expect(verifyTotp(code, secret)).toBe(true);
  });

  it('akzeptiert den Code trotz umgebender Leerzeichen', () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);
    expect(verifyTotp(`  ${code}  `, secret)).toBe(true);
  });

  it('lehnt einen Code für ein anderes Secret ab', () => {
    const secretA = generateTotpSecret();
    const secretB = generateTotpSecret();
    const codeForB = authenticator.generate(secretB);
    expect(verifyTotp(codeForB, secretA)).toBe(false);
  });

  it('lehnt fehlerhafte Eingaben ab, ohne zu werfen', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp('not-a-code', secret)).toBe(false);
    expect(verifyTotp('', secret)).toBe(false);
    // Leeres Secret führt otplib zum Wurf -> muss als false abgefangen werden.
    expect(verifyTotp('123456', '')).toBe(false);
  });
});

describe('totpQrDataUrl', () => {
  it('liefert eine PNG-Data-URL für die otpauth-URI', async () => {
    const secret = generateTotpSecret();
    const uri = totpKeyUri('person@example.org', secret);
    const dataUrl = await totpQrDataUrl(uri);
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });
});
