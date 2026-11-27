// @vitest-environment happy-dom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REPORT_EVERY_MS, useReportActivity } from "./useReportActivity";

// The user at work keeps their login session: reported when the page opens,
// and on their input at most every 5 minutes.

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const press = () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));

describe("useReportActivity", () => {
  it("reports when the page opens, then on input at most every 5 minutes", () => {
    const report = vi.fn(async () => {});
    renderHook(() => useReportActivity(report, true));
    expect(report).toHaveBeenCalledTimes(1);
    press();
    vi.advanceTimersByTime(REPORT_EVERY_MS - 1000);
    press();
    expect(report).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    press();
    expect(report).toHaveBeenCalledTimes(2);
    // Clicks and scrolling count; time alone, or the pointer just moving, doesn't
    vi.advanceTimersByTime(REPORT_EVERY_MS);
    window.dispatchEvent(new Event("pointermove"));
    expect(report).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event("pointerdown"));
    expect(report).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(REPORT_EVERY_MS);
    window.dispatchEvent(new Event("wheel"));
    expect(report).toHaveBeenCalledTimes(4);
  });

  it("reports nothing while not logged in, nor after it is gone; a failed report is no error", () => {
    const report = vi.fn(async () => {
      throw new Error("Unauthorized");
    });
    const { rerender, unmount } = renderHook(({ enabled }) => useReportActivity(report, enabled), {
      initialProps: { enabled: false },
    });
    press();
    expect(report).not.toHaveBeenCalled();
    rerender({ enabled: true });
    expect(report).toHaveBeenCalledTimes(1);
    unmount();
    vi.advanceTimersByTime(REPORT_EVERY_MS);
    press();
    expect(report).toHaveBeenCalledTimes(1);
  });
});
