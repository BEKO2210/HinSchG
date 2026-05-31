import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAuthorizationUrl,
  generatePkce,
  generateState,
  exchangeCode,
  fetchUserinfo,
  getOidcConfig,
  isOidcEnabled,
  type OidcConfig,
} from './oidc';

const OIDC_VARS = [
  'OIDC_AUTHORIZATION_ENDPOINT',
  'OIDC_TOKEN_ENDPOINT',
  'OIDC_USERINFO_ENDPOINT',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'OIDC_REDIRECT_URI',
  'OIDC_ISSUER_LABEL',
  'OIDC_SCOPE',
] as const;

const SAVED: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of OIDC_VARS) {
    SAVED[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of OIDC_VARS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
});

function setFullConfig() {
  process.env.OIDC_AUTHORIZATION_ENDPOINT = 'https://idp.example.org/authorize';
  process.env.OIDC_TOKEN_ENDPOINT = 'https://idp.example.org/token';
  process.env.OIDC_USERINFO_ENDPOINT = 'https://idp.example.org/userinfo';
  process.env.OIDC_CLIENT_ID = 'client-123';
  process.env.OIDC_CLIENT_SECRET = 'secret-xyz';
  process.env.OIDC_REDIRECT_URI = 'https://app.example.org/api/admin/sso/callback';
}

describe('getOidcConfig / isOidcEnabled', () => {
  it('ist null/aus ohne Konfiguration', () => {
    expect(getOidcConfig()).toBeNull();
    expect(isOidcEnabled()).toBe(false);
  });

  it('ist null, wenn nur teilweise konfiguriert', () => {
    process.env.OIDC_AUTHORIZATION_ENDPOINT = 'https://idp.example.org/authorize';
    process.env.OIDC_CLIENT_ID = 'client-123';
    expect(getOidcConfig()).toBeNull();
    expect(isOidcEnabled()).toBe(false);
  });

  it('liefert die Konfiguration bei vollständigen Werten', () => {
    setFullConfig();
    const config = getOidcConfig();
    expect(config).not.toBeNull();
    expect(config?.clientId).toBe('client-123');
    expect(config?.scope).toBe('openid email'); // Default
    expect(isOidcEnabled()).toBe(true);
  });
});

describe('PKCE & state', () => {
  it('generatePkce erzeugt eine korrekte S256-Challenge', () => {
    const { verifier, challenge } = generatePkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    const expected = createHash('sha256').update(verifier).digest('base64url');
    expect(challenge).toBe(expected);
  });

  it('generatePkce / generateState liefern jedes Mal neue Werte', () => {
    expect(generatePkce().verifier).not.toBe(generatePkce().verifier);
    expect(generateState()).not.toBe(generateState());
  });
});

describe('buildAuthorizationUrl', () => {
  const config: OidcConfig = {
    issuerLabel: 'SSO',
    authorizationEndpoint: 'https://idp.example.org/authorize',
    tokenEndpoint: 'https://idp.example.org/token',
    userinfoEndpoint: 'https://idp.example.org/userinfo',
    clientId: 'client-123',
    clientSecret: 'secret-xyz',
    redirectUri: 'https://app.example.org/cb',
    scope: 'openid email',
  };

  it('enthält alle Pflicht-Parameter inkl. PKCE S256', () => {
    const url = new URL(buildAuthorizationUrl(config, { state: 'st-1', codeChallenge: 'chal-1' }));
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('client-123');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example.org/cb');
    expect(url.searchParams.get('scope')).toBe('openid email');
    expect(url.searchParams.get('state')).toBe('st-1');
    expect(url.searchParams.get('code_challenge')).toBe('chal-1');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });
});

const TEST_CONFIG: OidcConfig = {
  issuerLabel: 'SSO',
  authorizationEndpoint: 'https://idp/authorize',
  tokenEndpoint: 'https://idp/token',
  userinfoEndpoint: 'https://idp/userinfo',
  clientId: 'client-1',
  clientSecret: 'secret-1',
  redirectUri: 'https://app/cb',
  scope: 'openid email',
};

describe('exchangeCode', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('tauscht den Code gegen das Access-Token', async () => {
    let body = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init: { body: string }) => {
        body = init.body;
        return { ok: true, json: async () => ({ access_token: 'tok_abc' }) };
      }),
    );
    const token = await exchangeCode(TEST_CONFIG, { code: 'c1', codeVerifier: 'v1' });
    expect(token).toBe('tok_abc');
    expect(body).toContain('grant_type=authorization_code');
    expect(body).toContain('code_verifier=v1');
  });

  it('wirft bei Fehlerantwort oder fehlendem Token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({}) })),
    );
    await expect(exchangeCode(TEST_CONFIG, { code: 'c', codeVerifier: 'v' })).rejects.toThrow();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({}) })),
    );
    await expect(exchangeCode(TEST_CONFIG, { code: 'c', codeVerifier: 'v' })).rejects.toThrow();
  });
});

describe('fetchUserinfo', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('liefert normalisierte E-Mail + email_verified (boolean)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ email: '  Person@Example.ORG ', email_verified: true }),
      })),
    );
    const id = await fetchUserinfo(TEST_CONFIG, 'tok');
    expect(id).toEqual({ email: 'person@example.org', emailVerified: true });
  });

  it('akzeptiert email_verified als String "true"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ email: 'a@b.de', email_verified: 'true' }),
      })),
    );
    expect((await fetchUserinfo(TEST_CONFIG, 'tok')).emailVerified).toBe(true);
  });

  it('emailVerified=false bei fehlendem/anderem Wert', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ email: 'a@b.de' }) })),
    );
    expect((await fetchUserinfo(TEST_CONFIG, 'tok')).emailVerified).toBe(false);
  });

  it('wirft, wenn keine E-Mail geliefert wird', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ email_verified: true }) })),
    );
    await expect(fetchUserinfo(TEST_CONFIG, 'tok')).rejects.toThrow();
  });

  it('behandelt ungültiges JSON als leeres Profil (wirft mangels E-Mail)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => {
          throw new Error('kaputt');
        },
      })),
    );
    await expect(fetchUserinfo(TEST_CONFIG, 'tok')).rejects.toThrow();
  });
});
