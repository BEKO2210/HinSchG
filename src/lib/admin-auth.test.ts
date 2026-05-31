import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks für Next.js-Server-APIs -------------------------------------------
// admin-auth liest das Cookie über next/headers und leitet via next/navigation
// um. Beides wird hier deterministisch ersetzt.
const cookieStore: { value: string | undefined } = { value: undefined };

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) =>
      cookieStore.value === undefined ? undefined : { name, value: cookieStore.value },
  }),
}));

const redirectMock = vi.fn((url: string) => {
  // Echtes redirect() bricht die Ausführung per throw ab — hier nachgebildet,
  // damit Aufrufer ebenfalls nicht weiterlaufen.
  throw new Error(`REDIRECT:${url}`);
});

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

import { adminApiGuard, getAdminSession, requireAdminSession } from './admin-auth';
import { createAdminSession, createInboxSession } from './session';

beforeAll(() => {
  process.env.SESSION_SECRET = 'test-session-secret-mindestens-16-zeichen';
});

beforeEach(() => {
  cookieStore.value = undefined;
  redirectMock.mockClear();
});

afterEach(() => {
  cookieStore.value = undefined;
});

describe('getAdminSession', () => {
  it('liefert null ohne Cookie', () => {
    expect(getAdminSession()).toBeNull();
  });

  it('liefert die Session bei gültigem Cookie', () => {
    cookieStore.value = createAdminSession('h_1', 'ADMIN').value;
    expect(getAdminSession()).toEqual({ h: 'h_1', r: 'ADMIN' });
  });

  it('liefert null für eine fremde (Inbox-)Session', () => {
    cookieStore.value = createInboxSession('case_1').value;
    expect(getAdminSession()).toBeNull();
  });
});

describe('adminApiGuard', () => {
  it('antwortet mit 401 ohne Session', async () => {
    const result = adminApiGuard();
    if (!('error' in result)) throw new Error('error erwartet');
    expect(result.error.status).toBe(401);
    await expect(result.error.json()).resolves.toEqual({ error: 'Nicht angemeldet.' });
  });

  it('lässt jede Rolle ohne Rollenfilter passieren', () => {
    cookieStore.value = createAdminSession('h_2', 'AUDITOR').value;
    const result = adminApiGuard();
    if ('error' in result) throw new Error('session erwartet');
    expect(result.session).toEqual({ h: 'h_2', r: 'AUDITOR' });
  });

  it('antwortet mit 403, wenn die Rolle nicht erlaubt ist', async () => {
    cookieStore.value = createAdminSession('h_3', 'HANDLER').value;
    const result = adminApiGuard(['ADMIN']);
    if (!('error' in result)) throw new Error('error erwartet');
    expect(result.error.status).toBe(403);
    await expect(result.error.json()).resolves.toEqual({ error: 'Keine Berechtigung.' });
  });

  it('lässt eine erlaubte Rolle passieren', () => {
    cookieStore.value = createAdminSession('h_4', 'HANDLER').value;
    const result = adminApiGuard(['ADMIN', 'HANDLER']);
    if ('error' in result) throw new Error('session erwartet');
    expect(result.session).toEqual({ h: 'h_4', r: 'HANDLER' });
  });
});

describe('requireAdminSession', () => {
  it('leitet ohne Session zum Login um', () => {
    expect(() => requireAdminSession()).toThrow('REDIRECT:/admin/login');
    expect(redirectMock).toHaveBeenCalledWith('/admin/login');
  });

  it('leitet bei unzureichender Rolle zum Dashboard um', () => {
    cookieStore.value = createAdminSession('h_5', 'AUDITOR').value;
    expect(() => requireAdminSession(['ADMIN'])).toThrow('REDIRECT:/admin');
    expect(redirectMock).toHaveBeenCalledWith('/admin');
  });

  it('liefert die Session bei passender Rolle zurück', () => {
    cookieStore.value = createAdminSession('h_6', 'ADMIN').value;
    expect(requireAdminSession(['ADMIN'])).toEqual({ h: 'h_6', r: 'ADMIN' });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
