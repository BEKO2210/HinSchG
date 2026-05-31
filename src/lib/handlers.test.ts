import { describe, expect, it } from 'vitest';
import { HANDLER_PASSWORD_MIN, validateHandlerInput } from './handlers';

describe('validateHandlerInput', () => {
  it('akzeptiert gültige Eingaben und normalisiert die E-Mail', () => {
    const result = validateHandlerInput({
      email: '  Neuer.Bearbeiter@Example.ORG ',
      password: 'x'.repeat(HANDLER_PASSWORD_MIN),
      role: 'HANDLER',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.email).toBe('neuer.bearbeiter@example.org');
      expect(result.value.role).toBe('HANDLER');
    }
  });

  it('lehnt ungültige E-Mails ab', () => {
    expect(
      validateHandlerInput({ email: 'keine-mail', password: 'x'.repeat(12), role: 'ADMIN' }).ok,
    ).toBe(false);
  });

  it('verlangt ein ausreichend langes Passwort', () => {
    expect(validateHandlerInput({ email: 'a@b.de', password: 'kurz', role: 'ADMIN' }).ok).toBe(
      false,
    );
  });

  it('lehnt unbekannte Rollen ab', () => {
    expect(
      validateHandlerInput({ email: 'a@b.de', password: 'x'.repeat(12), role: 'ROOT' }).ok,
    ).toBe(false);
  });

  it('lehnt nicht-objekte ab', () => {
    expect(validateHandlerInput(null).ok).toBe(false);
    expect(validateHandlerInput('text').ok).toBe(false);
  });

  it('behandelt fehlende/nicht-string Felder als ungültig', () => {
    // email/password/role nicht-string -> jeweils der ternäre false-Zweig.
    expect(validateHandlerInput({}).ok).toBe(false);
    expect(validateHandlerInput({ email: 123, password: 456, role: 789 }).ok).toBe(false);
    expect(validateHandlerInput({ email: 'a@b.de', password: 'x'.repeat(12), role: 12 }).ok).toBe(
      false,
    );
    // gültige E-Mail, aber nicht-string Passwort -> Passwort-Ternär false-Zweig.
    expect(validateHandlerInput({ email: 'a@b.de', password: 12345678, role: 'ADMIN' }).ok).toBe(
      false,
    );
  });
});
