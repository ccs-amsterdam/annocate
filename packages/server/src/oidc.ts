import * as client from "openid-client";

// Researcher login with an OpenID Connect provider, following the lab's
// Authentication standard (docs/security.md "Login"): any provider that
// verifies email addresses (`email_verified`), signals a second factor
// (`OIDC_MFA_CLAIM`), and supports step-up (`max_age`, `auth_time`); the
// first two can be turned off (`AUTH_INSECURE_*`, researcher/login.ts). The
// provider only proves who someone is; the session is ours
// (shared/sessions.ts). The identity is the provider (`iss`) and the user
// there (`sub`); the email address is how people find each other.

/**
 * Which claim counts as a second factor (`OIDC_MFA_CLAIM`): `amr:<value>`,
 * the `amr` list contains it (default `amr:mfa`), or `acr:<value>`, `acr`
 * equals it (e.g. SURFconext's assurance level).
 */
export type MfaClaim = { claim: "amr" | "acr"; value: string };

/** Parses `OIDC_MFA_CLAIM`; throws on anything else. */
export function parseMfaClaim(raw: string | undefined): MfaClaim {
  const text = (raw ?? "amr:mfa").trim();
  const match = /^(amr|acr):(.+)$/.exec(text);
  if (!match) throw new Error(`OIDC_MFA_CLAIM must be amr:<value> or acr:<value>, not "${text}"`);
  return { claim: match[1] as "amr" | "acr", value: match[2] };
}

export interface OidcOptions {
  /** The provider's issuer URL (`OIDC_HOST`), e.g. `https://auth.example.org/realms/idp`. */
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Default `amr:mfa`. */
  mfaClaim?: MfaClaim;
  /** Tests: how to reach the provider; also allows plain http. */
  fetch?: typeof fetch;
}

/** What the login flow keeps between redirect and callback (in a signed cookie). */
export interface LoginState {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  /** Which provider: the current one, or the previous one during a migration. */
  provider: "current" | "previous";
  /** A login for a sensitive action: it must come with a fresh second factor (`max_age`). */
  stepUp?: boolean;
  /** A step-up login at the previous provider that linking asked for: after it, linking goes on. */
  thenLink?: boolean;
  /** Linking this login to the account of the user logged in at the start (docs/security.md "Changing providers"). */
  linkUserId?: number;
}

/**
 * A login: who (`iss` + `sub`), their email and whether the provider
 * confirmed it (`emailVerified`: only `email_verified: true` counts), whether
 * it used a second factor (`mfa`, per `OIDC_MFA_CLAIM`), and when they
 * authenticated (`authTime`; null if the provider doesn't say).
 */
export type LoginResult =
  | { iss: string; sub: string; email: string; emailVerified: boolean; mfa: boolean; authTime: Date | null }
  | { error: "email_missing" | "login_failed" };

export class Oidc {
  private config: Promise<client.Configuration> | null = null;
  readonly mfaClaim: MfaClaim;

  constructor(private options: OidcOptions) {
    this.mfaClaim = options.mfaClaim ?? { claim: "amr", value: "mfa" };
  }

  get issuer(): string {
    return this.options.issuer;
  }

  /** Discovered once, retried after a failure (provider down at startup). */
  private configuration(): Promise<client.Configuration> {
    const { issuer, clientId, clientSecret } = this.options;
    const url = new URL(issuer);
    // Plain http only for a provider on this machine (development).
    const local = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    this.config ??= client
      .discovery(url, clientId, undefined, client.ClientSecretPost(clientSecret), {
        ...(this.options.fetch ? { [client.customFetch]: this.options.fetch as client.CustomFetch } : {}),
        ...(this.options.fetch || local ? { execute: [client.allowInsecureRequests] } : {}),
      })
      .catch((err: unknown) => {
        this.config = null;
        throw err;
      });
    return this.config;
  }

  /**
   * Where to send the browser, and what to remember until the callback.
   * `maxAge` (seconds): the provider must have authenticated the user that
   * recently, else it asks again (step-up). `promptLogin`: it asks again
   * whatever session the browser has there (`prompt=login`).
   */
  async start(
    redirectUri: string,
    login: Omit<LoginState, "state" | "nonce" | "verifier">,
    { maxAge, promptLogin }: { maxAge?: number; promptLogin?: boolean } = {},
  ): Promise<{ url: URL; state: LoginState }> {
    const verifier = client.randomPKCECodeVerifier();
    const state: LoginState = { ...login, state: client.randomState(), nonce: client.randomNonce(), verifier };
    const url = client.buildAuthorizationUrl(await this.configuration(), {
      redirect_uri: redirectUri,
      scope: "openid email",
      code_challenge: await client.calculatePKCECodeChallenge(verifier),
      code_challenge_method: "S256",
      state: state.state,
      nonce: state.nonce,
      ...(maxAge !== undefined ? { max_age: String(maxAge) } : {}),
      ...(promptLogin ? { prompt: "login" } : {}),
    });
    return { url, state };
  }

  /** Exchanges the code at the provider and checks the ID token. `callbackUrl`: the full URL the provider redirected to. */
  async finish(callbackUrl: URL, login: LoginState): Promise<LoginResult> {
    let claims: client.IDToken | undefined;
    try {
      const tokens = await client.authorizationCodeGrant(await this.configuration(), callbackUrl, {
        pkceCodeVerifier: login.verifier,
        expectedState: login.state,
        expectedNonce: login.nonce,
        idTokenExpected: true,
      });
      claims = tokens.claims();
    } catch (err) {
      console.warn("Login failed:", err instanceof Error ? err.message : err);
      return { error: "login_failed" };
    }
    if (!claims || typeof claims.email !== "string" || !claims.email.trim()) return { error: "email_missing" };
    const { claim, value } = this.mfaClaim;
    const mfa =
      claim === "amr" ? Array.isArray(claims.amr) && claims.amr.map(String).includes(value) : claims.acr === value;
    const authTime = typeof claims.auth_time === "number" ? new Date(claims.auth_time * 1000) : null;
    return {
      iss: claims.iss,
      sub: claims.sub,
      email: claims.email.trim().toLowerCase(),
      emailVerified: claims.email_verified === true,
      mfa,
      authTime,
    };
  }
}
