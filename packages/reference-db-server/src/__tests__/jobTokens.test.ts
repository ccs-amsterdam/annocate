import { describe, expect, it } from "vitest";
import { JobTokenIssuer } from "../jobTokens.js";

// Job tokens are checked on every backend call (from step 3 of plan §13).
describe("JobTokenIssuer.verifyToken", () => {
  let now = Date.now();
  const issuer = new JobTokenIssuer({ secret: "s", publicUrl: "http://db.test", now: () => now });
  const sign = (claims: object, secret = "s") =>
    // A token as `issue` makes it, without the round trip.
    (new JobTokenIssuer({ secret, publicUrl: "http://db.test", now: () => now }) as unknown as { sign(c: object): string }).sign(claims);

  it("accepts its own tokens until they expire, and nothing else", () => {
    const token = sign({ jobId: 1, aud: "https://jobs.example", exp: Math.floor(now / 1000) + 60, ck: "k" });
    expect(issuer.verifyToken(token)).toMatchObject({ jobId: 1, aud: "https://jobs.example" });
    expect(issuer.verifyToken(sign({ jobId: 1, exp: Math.floor(now / 1000) + 60 }, "other secret"))).toBeNull();
    const [h, , sig] = token.split(".");
    expect(issuer.verifyToken(`${h}.${Buffer.from(JSON.stringify({ jobId: 2, exp: 9e9 })).toString("base64url")}.${sig}`)).toBeNull();
    now += 61_000;
    expect(issuer.verifyToken(token)).toBeNull();
  });

  it("derives the same call key every time, different per job server and job", () => {
    expect(issuer.callKey("https://jobs.example", 1)).toBe(issuer.callKey("https://jobs.example", 1));
    expect(issuer.callKey("https://jobs.example", 2)).not.toBe(issuer.callKey("https://jobs.example", 1));
    expect(issuer.callKey("https://other.example", 1)).not.toBe(issuer.callKey("https://jobs.example", 1));
  });
});
