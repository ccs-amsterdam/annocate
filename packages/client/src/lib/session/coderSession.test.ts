import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getOrCreateCoderKey, storeCoderKey } from "./coderSession";

describe("coder keys on this device", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  const scope = { baseUrl: "https://jobs/d/mock.1", inviteSecret: "inv" };

  it("keeps one key per job server, invite and participant", () => {
    const key = getOrCreateCoderKey(scope);
    expect(key).toMatch(/^[0-9a-f]{48}$/);
    expect(getOrCreateCoderKey(scope)).toBe(key);
    expect(getOrCreateCoderKey({ ...scope, participantId: "P1" })).not.toBe(key);
    expect(getOrCreateCoderKey({ ...scope, inviteSecret: "other" })).not.toBe(key);
  });

  it("replaces the stored key, e.g. after a transfer or for a new session", () => {
    getOrCreateCoderKey(scope);
    storeCoderKey(scope, "transferred");
    expect(getOrCreateCoderKey(scope)).toBe("transferred");
  });

  it("still works without storage", () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(getOrCreateCoderKey(scope)).toMatch(/^[0-9a-f]{48}$/);
  });
});
