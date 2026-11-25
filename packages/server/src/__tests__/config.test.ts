import { describe, expect, it } from "vitest";
import { describeConfig, readConfig, type Environment } from "../config.js";

/** A server with a login provider, as docs/hosting.md sets one up. */
const LOGIN: Environment = {
  OIDC_HOST: "https://auth.example.org/realms/idp",
  OIDC_CLIENT_ID: "annotinder",
  OIDC_CLIENT_SECRET: "client-secret",
  OIDC_ACCOUNT_URL: "https://auth.example.org/realms/idp/account",
  ANNOTINDER_PUBLIC_URL: "https://annotinder.example.org",
  ANNOTINDER_SECRET: "0123456789abcdef0123456789abcdef",
};

describe("the server's settings", () => {
  it("have defaults for development: no login, no rate-limit proxy, all addresses", () => {
    const config = readConfig({});
    expect(config).toMatchObject({
      port: 8787,
      host: undefined,
      demo: false,
      devMode: false,
      secret: undefined,
      login: undefined,
      stepUpMaxAge: 600,
      insecure: { disable2fa: false, disableEmailVerification: false },
      frameAncestors: [],
      https: false,
      rateLimits: { newSessions: 500 },
      trustProxy: "none",
    });
  });

  it("read the login provider, the public address and the lists", () => {
    const config = readConfig({
      ...LOGIN,
      PORT: "9000",
      OIDC_MFA_CLAIM: "acr:https://refeds.org/profile/mfa",
      ANNOTINDER_ADMINS: "a@vu.nl,b@vu.nl",
      ANNOTINDER_FRAME_ANCESTORS: "https://amcat.example.org, https://other.example.org",
      ANNOTINDER_TRUST_PROXY: "cloudflare",
      AUTH_STEP_UP_MAX_AGE: "300",
    });
    expect(config.port).toBe(9000);
    expect(config.login).toEqual({
      oidc: {
        issuer: "https://auth.example.org/realms/idp",
        clientId: "annotinder",
        clientSecret: "client-secret",
        mfaClaim: { claim: "acr", value: "https://refeds.org/profile/mfa" },
      },
      publicUrl: "https://annotinder.example.org",
      accountUrl: "https://auth.example.org/realms/idp/account",
    });
    expect(config.https).toBe(true);
    expect(config.admins).toEqual(["a@vu.nl", "b@vu.nl"]);
    expect(config.frameAncestors).toEqual(["https://amcat.example.org", "https://other.example.org"]);
    expect(config.trustProxy).toBe("cloudflare");
    expect(config.stepUpMaxAge).toBe(300);
  });

  it("an empty value counts as unset", () => {
    const config = readConfig({ ANNOTINDER_SECRET: "", ANNOTINDER_FILES_DIR: "", ANNOTINDER_TRUST_PROXY: "" });
    expect(config).toMatchObject({ secret: undefined, filesDir: undefined, trustProxy: "none" });
  });

  it("read what the operator says about the server: nothing by default, links only as web addresses", () => {
    const nothing = { operator: null, hosting: null, contact: null, privacyUrl: null, termsUrl: null };
    expect(readConfig({}).info).toEqual(nothing);
    expect(readConfig({ ANNOTINDER_OPERATOR: " ", ANNOTINDER_PRIVACY_URL: "" }).info).toEqual(nothing);
    const info = readConfig({
      ANNOTINDER_OPERATOR: " The Example Lab, Example University ",
      ANNOTINDER_HOSTING: "A university data centre in Exampletown",
      ANNOTINDER_CONTACT: "annotinder@example.org",
      ANNOTINDER_PRIVACY_URL: "https://example.org/privacy",
      ANNOTINDER_TERMS_URL: "https://example.org/terms",
    }).info;
    expect(info).toEqual({
      operator: "The Example Lab, Example University",
      hosting: "A university data centre in Exampletown",
      contact: "annotinder@example.org",
      privacyUrl: "https://example.org/privacy",
      termsUrl: "https://example.org/terms",
    });
    expect(() => readConfig({ ANNOTINDER_PRIVACY_URL: "javascript:alert(1)" })).toThrow(
      'ANNOTINDER_PRIVACY_URL must be a web address, not "javascript:alert(1)"',
    );
    expect(() => readConfig({ ANNOTINDER_TERMS_URL: "example.org/terms" })).toThrow("ANNOTINDER_TERMS_URL must be");
  });

  it("development mode only where the server listens on localhost", () => {
    expect(readConfig({ AUTH_DEV_MODE: "1" })).toMatchObject({ devMode: true, host: "localhost" });
    expect(readConfig({ AUTH_DEV_MODE: "1", HOST: "127.0.0.1" }).host).toBe("127.0.0.1");
    expect(() => readConfig({ AUTH_DEV_MODE: "1", HOST: "0.0.0.0" })).toThrow(
      "AUTH_DEV_MODE needs the server to listen on localhost only (HOST=0.0.0.0)",
    );
  });

  it("a login with a required second factor needs the provider's account page", () => {
    const withoutAccountUrl = { ...LOGIN, OIDC_ACCOUNT_URL: undefined };
    expect(() => readConfig(withoutAccountUrl)).toThrow("OIDC_ACCOUNT_URL is required");
    expect(() => readConfig({ ...LOGIN, OIDC_ACCOUNT_URL: "auth.example.org/account" })).toThrow(
      'OIDC_ACCOUNT_URL must be a web address, not "auth.example.org/account"',
    );
    const weaker = readConfig({ ...withoutAccountUrl, AUTH_INSECURE_DISABLE_2FA: "true" });
    expect(weaker.insecure.disable2fa).toBe(true);
    expect(weaker.login).not.toHaveProperty("accountUrl");
  });

  it("refuses values it can't read", () => {
    expect(() => readConfig({ AUTH_STEP_UP_MAX_AGE: "ten minutes" })).toThrow(
      "AUTH_STEP_UP_MAX_AGE must be a number of seconds",
    );
    expect(() => readConfig({ AUTH_STEP_UP_MAX_AGE: "0" })).toThrow("AUTH_STEP_UP_MAX_AGE");
    expect(() => readConfig({ AUTH_INSECURE_DISABLE_2FA: "1" })).toThrow(
      'AUTH_INSECURE_DISABLE_2FA must be true or false, not "1"',
    );
    expect(() => readConfig({ ...LOGIN, OIDC_MFA_CLAIM: "mfa" })).toThrow("OIDC_MFA_CLAIM must be");
    expect(() => readConfig({ ANNOTINDER_TRUST_PROXY: "1" })).toThrow(
      'ANNOTINDER_TRUST_PROXY must be none, proxy, cloudflare, not "1"',
    );
    expect(() => readConfig({ ANNOTINDER_NEW_SESSIONS_PER_ADDRESS: "many" })).toThrow(
      'ANNOTINDER_NEW_SESSIONS_PER_ADDRESS must be a number or off, not "many"',
    );
  });

  it("the previous login provider needs its client and an end date", () => {
    const previous = {
      OIDC_PREVIOUS_HOST: "https://old.example.org",
      OIDC_PREVIOUS_CLIENT_ID: "annotinder",
      OIDC_PREVIOUS_CLIENT_SECRET: "old-secret",
      OIDC_PREVIOUS_UNTIL: "2027-01-31",
    };
    expect(readConfig({ ...LOGIN, ...previous }).login?.previous).toEqual({
      oidc: {
        issuer: "https://old.example.org",
        clientId: "annotinder",
        clientSecret: "old-secret",
        mfaClaim: { claim: "amr", value: "mfa" },
      },
      until: new Date("2027-01-31"),
    });
    const needs =
      "OIDC_PREVIOUS_HOST needs OIDC_PREVIOUS_CLIENT_ID, OIDC_PREVIOUS_CLIENT_SECRET and OIDC_PREVIOUS_UNTIL";
    expect(() => readConfig({ ...LOGIN, ...previous, OIDC_PREVIOUS_UNTIL: "next month" })).toThrow(needs);
    expect(() => readConfig({ ...LOGIN, ...previous, OIDC_PREVIOUS_CLIENT_SECRET: "" })).toThrow(needs);
  });

  it("rate limits: the brake on new sessions can be set or turned off, and all limits too", () => {
    expect(readConfig({ ANNOTINDER_NEW_SESSIONS_PER_ADDRESS: "2000" }).rateLimits).toEqual({ newSessions: 2000 });
    expect(readConfig({ ANNOTINDER_NEW_SESSIONS_PER_ADDRESS: "off" }).rateLimits).toEqual({ newSessions: Infinity });
    expect(readConfig({ ANNOTINDER_RATE_LIMITS: "off" }).rateLimits).toBeUndefined();
  });
});

describe("a server on Postgres, outside development mode", () => {
  const PRODUCTION: Environment = { ...LOGIN, DATABASE_URL: "postgres://annotinder:pw@db:5432/annotinder" };

  it("starts with a secret and its public address", () => {
    expect(readConfig(PRODUCTION)).toMatchObject({ secret: LOGIN.ANNOTINDER_SECRET, https: true });
  });

  it("doesn't start without a secret", () => {
    for (const ANNOTINDER_SECRET of [undefined, ""])
      expect(() => readConfig({ ...PRODUCTION, ANNOTINDER_SECRET })).toThrow(
        "ANNOTINDER_SECRET is required with DATABASE_URL",
      );
  });

  it("doesn't start without its public address, or with one that isn't an origin", () => {
    expect(() => readConfig({ ...PRODUCTION, ANNOTINDER_PUBLIC_URL: undefined })).toThrow(
      "ANNOTINDER_PUBLIC_URL is required with DATABASE_URL",
    );
    for (const ANNOTINDER_PUBLIC_URL of ["annotinder.example.org", "https://annotinder.example.org/"])
      expect(() => readConfig({ ...PRODUCTION, ANNOTINDER_PUBLIC_URL })).toThrow(
        `ANNOTINDER_PUBLIC_URL must be a web address without a path or trailing slash, not "${ANNOTINDER_PUBLIC_URL}"`,
      );
  });

  it("a short secret is refused everywhere; development needs neither setting", () => {
    expect(() => readConfig({ ANNOTINDER_SECRET: "short" })).toThrow(
      "ANNOTINDER_SECRET must be at least 32 characters (it has 5)",
    );
    const development = { DATABASE_URL: PRODUCTION.DATABASE_URL, AUTH_DEV_MODE: "1" };
    expect(readConfig(development)).toMatchObject({ devMode: true, secret: undefined });
    expect(readConfig({})).toMatchObject({ secret: undefined });
  });
});

describe("what the server says of its settings at start-up", () => {
  it("names the login provider, the admins, the client and where addresses come from; no secrets", () => {
    const config = readConfig({ ...LOGIN, ANNOTINDER_ADMINS: "a@vu.nl, ", ANNOTINDER_TRUST_PROXY: "proxy" });
    const { lines, warnings } = describeConfig(config);
    expect(lines).toEqual([
      "researcher login: https://auth.example.org/realms/idp (second factor: amr:mfa), callback https://annotinder.example.org/api/auth/callback",
      "admins: a@vu.nl",
      "client: not served here (ANNOTINDER_CLIENT_DIR; in development Vite serves it)",
      "client addresses (rate limits): the last entry of X-Forwarded-For (one proxy in front)",
    ]);
    expect(warnings).toEqual([]);
    expect(JSON.stringify({ lines, warnings })).not.toContain("client-secret");
    expect(JSON.stringify({ lines, warnings })).not.toContain(LOGIN.ANNOTINDER_SECRET);
  });

  it("warns about weaker security, and says when it is in development mode", () => {
    const weaker = readConfig({
      AUTH_INSECURE_DISABLE_2FA: "true",
      AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION: "true",
      AUTH_DEV_MODE: "1",
      ANNOTINDER_RATE_LIMITS: "off",
    });
    const { lines, warnings } = describeConfig(weaker);
    expect(lines).toContain("researcher login: not configured (OIDC_HOST)");
    expect(lines).toContain("client addresses (rate limits): not used (ANNOTINDER_RATE_LIMITS=off)");
    expect(lines).toContain(
      "development mode (AUTH_DEV_MODE=1): development auth headers accepted, listening on localhost only",
    );
    expect(warnings.map((warning) => warning.split(":")[0])).toEqual([
      "AUTH_INSECURE_DISABLE_2FA",
      "AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION",
    ]);
  });
});
