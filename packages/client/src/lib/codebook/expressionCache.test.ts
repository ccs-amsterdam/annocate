import { beforeEach, describe, expect, it, vi } from "vitest";
import * as expressionModule from "./expression";
import { ExpressionCache } from "./expressionCache";

describe("ExpressionCache", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reuses the cached result when the slot's declared dependencies are unchanged", async () => {
    const spy = vi.spyOn(expressionModule, "evaluateExpression").mockResolvedValue("result");
    const cache = new ExpressionCache();

    await cache.evaluate("slot", "a + b", { a: 1, b: 2, unrelated: "x" });
    const second = await cache.evaluate("slot", "a + b", { a: 1, b: 2, unrelated: "y" });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(second).toBe("result");
  });

  it("re-evaluates when a declared dependency's value changes", async () => {
    const spy = vi.spyOn(expressionModule, "evaluateExpression").mockResolvedValue("result");
    const cache = new ExpressionCache();

    await cache.evaluate("slot", "a + b", { a: 1, b: 2 });
    await cache.evaluate("slot", "a + b", { a: 2, b: 2 });

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("keeps separate slots (different keys) independently cached", async () => {
    const spy = vi.spyOn(expressionModule, "evaluateExpression").mockResolvedValue("result");
    const cache = new ExpressionCache();

    await cache.evaluate("slot-a", "a", { a: 1 });
    await cache.evaluate("slot-b", "a", { a: 1 });

    expect(spy).toHaveBeenCalledTimes(2);
  });
});
