// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { markerOf, useBrowserHistory } from "./browserHistory";

function setup(enabled = true) {
  const onBack = vi.fn();
  const onForward = vi.fn();
  const hook = renderHook(({ key }) => useBrowserHistory({ enabled, key, onBack, onForward }), {
    initialProps: { key: "a" as string | null },
  });
  return { ...hook, onBack, onForward };
}

const pop = (index: number) =>
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate", { state: markerOf(index) }));
  });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useBrowserHistory", () => {
  it("pushes an entry for each new place, not for the first", () => {
    const push = vi.spyOn(window.history, "pushState");
    const { rerender } = setup();
    expect(push).not.toHaveBeenCalled();
    rerender({ key: "b" });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("answers the browser's Back and Forward with the screen's own", () => {
    const { rerender, onBack, onForward } = setup();
    rerender({ key: "b" });
    pop(0);
    expect(onBack).toHaveBeenCalledTimes(1);
    pop(1);
    expect(onForward).toHaveBeenCalledTimes(1);
  });

  it("leaves the history alone in a preview", () => {
    const push = vi.spyOn(window.history, "pushState");
    const { rerender, result, onBack } = setup(false);
    rerender({ key: "b" });
    expect(push).not.toHaveBeenCalled();
    result.current.back();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("goes back directly where there is no entry before", () => {
    const back = vi.spyOn(window.history, "back");
    const { result, onBack } = setup();
    result.current.back();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
  });

  it("goes back through the history where there is an entry before", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { rerender, result, onBack } = setup();
    rerender({ key: "b" });
    result.current.back();
    expect(back).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();
  });

  it("stops listening when unmounted", () => {
    const { unmount, onBack } = setup();
    unmount();
    pop(0);
    expect(onBack).not.toHaveBeenCalled();
  });
});
