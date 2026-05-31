import { describe, expect, it } from 'vitest';
import { HANDLER_PASSWORD_MIN, validateHandlerInput } from './handlers';

describe('validateHandlerInput', () => {
  it('akzeptiert gueltige Eingaben und normalisiert die E-Mail', () => {
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

  it('lehnt ungueltige E-Mails ab', () => {
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
  });
});
