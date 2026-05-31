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
  it('liefert null ohne Cookie', async () => {
    expect(await getAdminSession()).toBeNull();
  });

  it('liefert die Session bei gültigem Cookie', async () => {
    cookieStore.value = createAdminSession('h_1', 'ADMIN', 'office_1').value;
    expect(await getAdminSession()).toEqual({ h: 'h_1', r: 'ADMIN', o: 'office_1' });
  });

  it('liefert null für eine fremde (Inbox-)Session', async () => {
    cookieStore.value = createInboxSession('case_1').value;
    expect(await getAdminSession()).toBeNull();
  });
});

describe('adminApiGuard', () => {
  it('antwortet mit 401 ohne Session', async () => {
    const result = await adminApiGuard();
    if (!('error' in result)) throw new Error('error erwartet');
    expect(result.error.status).toBe(401);
    await expect(result.error.json()).resolves.toEqual({ error: 'Nicht angemeldet.' });
  });

  it('lässt jede Rolle ohne Rollenfilter passieren', async () => {
    cookieStore.value = createAdminSession('h_2', 'AUDITOR', 'office_1').value;
    const result = await adminApiGuard();
    if ('error' in result) throw new Error('session erwartet');
    expect(result.session).toEqual({ h: 'h_2', r: 'AUDITOR', o: 'office_1' });
  });

  it('antwortet mit 403, wenn die Rolle nicht erlaubt ist', async () => {
    cookieStore.value = createAdminSession('h_3', 'HANDLER', 'office_1').value;
    const result = await adminApiGuard(['ADMIN']);
    if (!('error' in result)) throw new Error('error erwartet');
    expect(result.error.status).toBe(403);
    await expect(result.error.json()).resolves.toEqual({ error: 'Keine Berechtigung.' });
  });

  it('lässt eine erlaubte Rolle passieren', async () => {
    cookieStore.value = createAdminSession('h_4', 'HANDLER', 'office_1').value;
    const result = await adminApiGuard(['ADMIN', 'HANDLER']);
    if ('error' in result) throw new Error('session erwartet');
    expect(result.session).toEqual({ h: 'h_4', r: 'HANDLER', o: 'office_1' });
  });
});

describe('requireAdminSession', () => {
  it('leitet ohne Session zum Login um', async () => {
    await expect(requireAdminSession()).rejects.toThrow('REDIRECT:/admin/login');
    expect(redirectMock).toHaveBeenCalledWith('/admin/login');
  });

  it('leitet bei unzureichender Rolle zum Dashboard um', async () => {
    cookieStore.value = createAdminSession('h_5', 'AUDITOR', 'office_1').value;
    await expect(requireAdminSession(['ADMIN'])).rejects.toThrow('REDIRECT:/admin');
    expect(redirectMock).toHaveBeenCalledWith('/admin');
  });

  it('liefert die Session bei passender Rolle zurück', async () => {
    cookieStore.value = createAdminSession('h_6', 'ADMIN', 'office_1').value;
    expect(await requireAdminSession(['ADMIN'])).toEqual({ h: 'h_6', r: 'ADMIN', o: 'office_1' });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
