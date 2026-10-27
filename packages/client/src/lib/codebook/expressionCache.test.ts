import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReferenceScope } from "@annotinder/contracts";
import * as expressionModule from "./expression";
import { ExpressionCache } from "./expressionCache";

const scope = (unit: Record<string, unknown>): ReferenceScope => ({ $unit: unit, $var: {} });

describe("ExpressionCache", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reuses the cached result when the referenced values are unchanged", async () => {
    const spy = vi.spyOn(expressionModule, "evaluateScript").mockResolvedValue("result");
    const cache = new ExpressionCache();

    await cache.evaluate("slot", "$unit.a + $unit.b", scope({ a: 1, b: 2, unrelated: "x" }));
    const second = await cache.evaluate("slot", "$unit.a + $unit.b", scope({ a: 1, b: 2, unrelated: "y" }));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(second).toBe("result");
  });

  it("re-evaluates when a referenced value or the script changes", async () => {
    const spy = vi.spyOn(expressionModule, "evaluateScript").mockResolvedValue("result");
    const cache = new ExpressionCache();

    await cache.evaluate("slot", "$unit.a + $unit.b", scope({ a: 1, b: 2 }));
    await cache.evaluate("slot", "$unit.a + $unit.b", scope({ a: 2, b: 2 }));
    await cache.evaluate("slot", "$unit.a * $unit.b", scope({ a: 2, b: 2 }));

    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("keeps separate slots (different keys) independently cached", async () => {
    const spy = vi.spyOn(expressionModule, "evaluateScript").mockResolvedValue("result");
    const cache = new ExpressionCache();

    await cache.evaluate("slot-a", "$unit.a + 1", scope({ a: 1 }));
    await cache.evaluate("slot-b", "$unit.a + 1", scope({ a: 1 }));

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("never caches scripts with computed references", async () => {
    const spy = vi.spyOn(expressionModule, "evaluateScript").mockResolvedValue("result");
    const cache = new ExpressionCache();

    await cache.evaluate("slot", "$unit['a']", scope({ a: 1 }));
    await cache.evaluate("slot", "$unit['a']", scope({ a: 1 }));

    expect(spy).toHaveBeenCalledTimes(2);
  });
});
