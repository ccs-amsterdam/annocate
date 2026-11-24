import { describe, expect, it } from "vitest";
import { formatWhen, httpsUrl } from "./format";

describe("formatWhen", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  it("formats recent times relatively and older ones as a date", () => {
    expect(formatWhen(null, now)).toBe("–");
    expect(formatWhen(new Date("2026-10-19T11:59:40Z"), now)).toBe("just now");
    expect(formatWhen(new Date("2026-10-19T11:55:00Z"), now)).toMatch(/5 minutes ago/);
    expect(formatWhen(new Date("2026-10-18T12:00:00Z"), now)).toMatch(/yesterday/);
    expect(formatWhen(new Date("2026-09-01T12:00:00Z"), now)).not.toMatch(/ago/);
  });
});

describe("httpsUrl", () => {
  it("keeps an https link, and nothing else", () => {
    expect(httpsUrl("https://login.example.org/account")).toBe("https://login.example.org/account");
    expect(httpsUrl("javascript:alert(1)")).toBeNull();
    expect(httpsUrl("data:text/html,<script>1</script>")).toBeNull();
    expect(httpsUrl("http://login.example.org")).toBeNull();
    expect(httpsUrl("not a link")).toBeNull();
    expect(httpsUrl(null)).toBeNull();
  });
});
