import * as client from "openid-client";

// Researcher login with an OpenID Connect provider (docs/coder-identity.md
// "Researcher login"): any provider, configured by its issuer URL. The
// provider only proves who someone is; the session is ours
// (shared/sessions.ts). Identity is the verified email address: the
// provider MUST verify addresses, and a login without `email_verified: true`
// is refused.

export interface OidcOptions {
  /** The provider's issuer URL, e.g. `https://auth.example.org/application/o/annotinder/`. */
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Tests: how to reach the provider; also allows plain http. */
  fetch?: typeof fetch;
}

/** `amr` values that mean a second factor was used (RFC 8176). */
const SECOND_FACTORS = new Set(["mfa", "otp", "hwk", "swk", "sc", "fpt", "face", "iris"]);

/** What the login flow keeps between redirect and callback (in a signed cookie). */
export interface LoginState {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
}

/** `mfa`: the login used a second factor (the ID token's `amr` claim). */
export type LoginResult = { email: string; mfa: boolean } | { error: "email_unverified" | "login_failed" };

export class Oidc {
  private config: Promise<client.Configuration> | null = null;

  constructor(private options: OidcOptions) {}

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

  /** Where to send the browser, and what to remember until the callback. */
  async start(redirectUri: string, returnTo: string): Promise<{ url: URL; state: LoginState }> {
    const verifier = client.randomPKCECodeVerifier();
    const state: LoginState = { state: client.randomState(), nonce: client.randomNonce(), verifier, returnTo };
    const url = client.buildAuthorizationUrl(await this.configuration(), {
      redirect_uri: redirectUri,
      scope: "openid email",
      code_challenge: await client.calculatePKCECodeChallenge(verifier),
      code_challenge_method: "S256",
      state: state.state,
      nonce: state.nonce,
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
    if (!claims || typeof claims.email !== "string" || claims.email_verified !== true) return { error: "email_unverified" };
    const amr = Array.isArray(claims.amr) ? claims.amr : [];
    return { email: claims.email, mfa: amr.some((method) => SECOND_FACTORS.has(String(method))) };
  }
}
