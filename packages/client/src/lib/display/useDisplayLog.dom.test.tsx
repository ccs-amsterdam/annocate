// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import type { DisplayEntry } from "@annotinder/contracts";
import { useDisplayLog } from "./hooks";

type Send = (entry: DisplayEntry) => Promise<void>;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** The coding screen's display log, with what was sent; `show` changes how the screen looks. */
function logging(first: DisplayEntry | null, send: Send = async () => {}) {
  const sent: DisplayEntry[] = [];
  const record: Send = (entry) => {
    sent.push(entry);
    return send(entry);
  };
  const hook = renderHook(({ entry }) => useDisplayLog(record, entry), { initialProps: { entry: first } });
  return { sent, show: (entry: DisplayEntry | null) => hook.rerender({ entry }), unmount: hook.unmount };
}

const WIDE: DisplayEntry = { keys: "numbers", width: "wide", theme: "light" };
const NARROW: DisplayEntry = { ...WIDE, width: "narrow" };

describe("recording how the coder's screen looks", () => {
  it("sends it when the session is loaded, once", () => {
    const { sent, show } = logging(null);
    expect(sent).toEqual([]);
    show(WIDE);
    show({ ...WIDE });
    expect(sent).toEqual([WIDE]);
  });

  it("sends a change of keys or theme at once", () => {
    const { sent, show } = logging(WIDE);
    show({ ...WIDE, keys: "letters" });
    show({ ...WIDE, keys: "letters", theme: "dark" });
    expect(sent.map((e) => [e.keys, e.theme])).toEqual([
      ["numbers", "light"],
      ["letters", "light"],
      ["letters", "dark"],
    ]);
  });

  it("a change of width alone waits 3 seconds: resizing records only where it ends up", () => {
    const { sent, show } = logging(WIDE);
    show(NARROW);
    vi.advanceTimersByTime(2000);
    show(WIDE);
    vi.advanceTimersByTime(2000);
    show(NARROW);
    vi.advanceTimersByTime(2999);
    expect(sent).toEqual([WIDE]);
    vi.advanceTimersByTime(1);
    expect(sent).toEqual([WIDE, NARROW]);
  });

  it("a width that came back to what was sent sends nothing", () => {
    const { sent, show } = logging(WIDE);
    show(NARROW);
    show(WIDE);
    vi.advanceTimersByTime(10_000);
    expect(sent).toEqual([WIDE]);
  });

  it("a width still waiting is not sent once the screen is gone", () => {
    const { sent, show, unmount } = logging(WIDE);
    show(NARROW);
    unmount();
    vi.advanceTimersByTime(10_000);
    expect(sent).toEqual([WIDE]);
  });

  it("an entry that couldn't be sent (offline) is sent again with the next change, at once", async () => {
    let online = false;
    const { sent, show } = logging(WIDE, async () => {
      if (!online) throw new Error("offline");
    });
    await vi.advanceTimersByTimeAsync(0);
    online = true;
    // Nothing was recorded: a width is not a change of width alone
    show(NARROW);
    expect(sent).toEqual([WIDE, NARROW]);
  });

  it("without a way to send (a preview), nothing happens", () => {
    const hook = renderHook(() => useDisplayLog(undefined, WIDE));
    vi.advanceTimersByTime(10_000);
    hook.unmount();
  });
});
