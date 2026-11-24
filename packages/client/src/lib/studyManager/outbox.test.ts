import type { VariableValue } from "@annotinder/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { Outbox, UnsentUnits, type OutboxItem, type UnitPost } from "./outbox";

const storage = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
} as Storage;
beforeEach(() => storage.clear());

/** Lets what is running (a send, a wait of 0 ms) go on. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const offline = () => new TypeError("Failed to fetch");
const refused = () => Object.assign(new Error("Refused"), { status: 400 });

/** A send the test finishes itself: `done()` (sent) or `fail(error)`. */
function pending() {
  let done: () => void = () => {};
  let fail: (err: unknown) => void = () => {};
  const promise = new Promise<void>((resolve, reject) => {
    done = resolve;
    fail = reject;
  });
  return { promise, done, fail };
}

/** An outbox, with what it sent (by label), its last reported state and the save errors it reported. */
function outbox({ retryMs = 0, sessionId = 1 }: { retryMs?: number; sessionId?: number | null } = {}) {
  const sent: string[] = [];
  const state: { unsaved?: number; unsavedUnits?: number; retrying?: boolean } = {};
  let errors = 0;
  const unsent = new UnsentUnits();
  unsent.sessionId = sessionId;
  const box = new Outbox(
    () => retryMs,
    (next) => Object.assign(state, next),
    () => (errors += 1),
    unsent,
  );
  /** An item that is sent at once, unless `send` says otherwise. */
  const item = (key: string, label: string, send: () => Promise<unknown> = async () => {}): OutboxItem => ({
    key,
    send: async () => {
      await send();
      sent.push(label);
    },
  });
  return { box, sent, state, unsent, item, errors: () => errors };
}

const post = (unitId: number, value = "A"): UnitPost => ({
  loop: "loop_1",
  unitId,
  answers: { q1: { done: true, values: [{ value }] } as unknown as VariableValue },
  timings: { q1: { firstMs: 10, totalMs: 10, hiddenMs: 0, edits: 0 } },
});

describe("saving in the background (Outbox)", () => {
  it("sends one at a time, in the order added", async () => {
    const { box, sent, state, item } = outbox();
    const first = pending();
    box.add(item("unit:1/1", "unit 1", () => first.promise));
    box.add(item("coder", "coder"));
    box.add(item("unit:1/2", "unit 2"));
    await tick();
    expect(sent).toEqual([]);
    expect(state.unsaved).toBe(3);
    first.done();
    await box.flush();
    expect(sent).toEqual(["unit 1", "coder", "unit 2"]);
    expect(state).toMatchObject({ unsaved: 0, retrying: false });
  });

  it("a newer item for the same answers replaces one still waiting, in its place", async () => {
    const { box, sent, item } = outbox();
    const first = pending();
    box.add(item("unit:1/1", "unit 1", () => first.promise));
    box.add(item("coder", "coder, old"));
    box.add(item("unit:1/2", "unit 2"));
    box.add(item("coder", "coder, new"));
    first.done();
    await box.flush();
    expect(sent).toEqual(["unit 1", "coder, new", "unit 2"]);
  });

  it("a newer item for the answers being sent is sent after it", async () => {
    const { box, sent, state, item } = outbox();
    const first = pending();
    box.add(item("coder", "old", () => first.promise));
    await tick();
    box.add(item("coder", "new"));
    expect(state.unsaved).toBe(2);
    first.done();
    await box.flush();
    expect(sent).toEqual(["old", "new"]);
  });

  it("without a connection it tries again; a newer item replaces the one waiting to be tried again", async () => {
    const { box, sent, state, item } = outbox({ retryMs: 20 });
    let attempts = 0;
    box.add(
      item("coder", "old", async () => {
        attempts += 1;
        throw offline();
      }),
    );
    await tick();
    expect(attempts).toBe(1);
    expect(state.retrying).toBe(true);
    box.add(item("coder", "new"));
    expect(state.unsaved).toBe(1);
    await box.flush();
    expect(sent).toEqual(["new"]);
    expect(attempts).toBe(1);
    expect(state).toMatchObject({ unsaved: 0, retrying: false });
  });

  it("tries again later and later, until it is sent", async () => {
    const waits: number[] = [];
    const sent: string[] = [];
    let attempts = 0;
    const box = new Outbox(
      (attempt) => {
        waits.push(attempt);
        return 0;
      },
      () => {},
      () => {},
      new UnsentUnits(),
    );
    box.add({
      key: "coder",
      send: async () => {
        attempts += 1;
        if (attempts < 4) throw Object.assign(new Error("Bad gateway"), { status: 502 });
        sent.push("coder");
      },
    });
    await box.flush();
    expect(waits).toEqual([1, 2, 3]);
    expect(sent).toEqual(["coder"]);
  });

  it("clearing during a send: what is added after is sent, and the send's outcome doesn't count", async () => {
    const { box, sent, state, item, errors } = outbox();
    const first = pending();
    box.add(item("unit:1/1", "dropped", () => first.promise));
    box.add(item("unit:1/2", "dropped too"));
    await tick();
    box.clear();
    box.add(item("unit:1/3", "after the clear"));
    first.fail(refused());
    await box.flush();
    expect(sent).toEqual(["after the clear"]);
    expect(box.error).toBeNull();
    expect(errors()).toBe(0);
    expect(state.unsaved).toBe(0);
  });

  it("clearing during a send that succeeds doesn't drop the item added after", async () => {
    const { box, sent, item } = outbox();
    const first = pending();
    box.add(item("unit:1/1", "sent while cleared", () => first.promise));
    await tick();
    box.clear();
    box.add(item("unit:1/2", "after the clear"));
    first.done();
    await box.flush();
    expect(sent).toEqual(["sent while cleared", "after the clear"]);
  });

  it("a refused item stops saving: flush throws, until the failure is cleared or the item dropped", async () => {
    const { box, sent, item, errors } = outbox();
    let refuse = true;
    box.add(
      item("unit:1/1", "unit 1", async () => {
        if (refuse) throw refused();
      }),
    );
    box.add(item("unit:1/2", "unit 2"));
    await tick();
    expect(errors()).toBe(1);
    expect(box.error).toMatchObject({ status: 400 });
    expect(box.failed?.key).toBe("unit:1/1");
    await expect(box.flush()).rejects.toMatchObject({ status: 400 });
    // Nothing more is sent while it failed
    box.add(item("coder", "coder"));
    await tick();
    expect(sent).toEqual([]);
    // Tried again (the failure cleared): everything is sent, in order
    refuse = false;
    box.error = null;
    await box.flush();
    expect(sent).toEqual(["unit 1", "unit 2", "coder"]);
  });

  it("dropping the refused item sends the rest", async () => {
    const { box, sent, state, item } = outbox();
    box.add(
      item("unit:1/1", "unit 1", async () => {
        throw refused();
      }),
    );
    box.add(item("unit:1/2", "unit 2"));
    await tick();
    box.dropFailed();
    await box.flush();
    expect(sent).toEqual(["unit 2"]);
    expect(box.error).toBeNull();
    expect(state.unsaved).toBe(0);
  });
});

describe("finished units kept in the browser until they are sent (UnsentUnits)", () => {
  it("holds the units waiting, in order, and none once they are sent", async () => {
    const { box, state, unsent, item } = outbox();
    const first = pending();
    box.add({ ...item("unit:1/1", "unit 1", () => first.promise), unit: post(1) });
    box.add(item("coder", "coder"));
    box.add({ ...item("unit:1/2", "unit 2"), unit: post(2) });
    expect(state).toMatchObject({ unsaved: 3, unsavedUnits: 2 });
    expect(unsent.read()).toEqual([post(1), post(2)]);
    first.done();
    await box.flush();
    expect(unsent.read()).toEqual([]);
    expect(storage.size).toBe(0);
    expect(state).toMatchObject({ unsaved: 0, unsavedUnits: 0 });
  });

  it("a reload finds them back: another store of the same session, not of another", async () => {
    const { box, item } = outbox({ retryMs: 1000 });
    box.add({
      ...item("unit:1/1", "unit 1", async () => {
        throw offline();
      }),
      unit: post(1),
    });
    await tick();
    // The unit changed while it waits to be tried again
    box.add({ ...item("unit:1/1", "unit 1 again"), unit: post(1, "B") });
    box.add({ ...item("unit:1/2", "unit 2"), unit: post(2) });
    const reloaded = new UnsentUnits();
    reloaded.sessionId = 1;
    expect(reloaded.read()).toEqual([post(1, "B"), post(2)]);
    reloaded.sessionId = 2;
    expect(reloaded.read()).toEqual([]);
    box.dispose();
  });

  it("clearing the outbox clears them", () => {
    const { box, unsent, item } = outbox({ retryMs: 1000 });
    box.add({
      ...item("unit:1/1", "unit 1", async () => {
        throw offline();
      }),
      unit: post(1),
    });
    expect(unsent.read()).toHaveLength(1);
    box.clear();
    expect(unsent.read()).toEqual([]);
    box.dispose();
  });

  it("storage that fails, or holds something else, keeps none and doesn't throw", () => {
    const unsent = new UnsentUnits();
    unsent.write([post(1)]); // no session yet
    expect(unsent.read()).toEqual([]);
    unsent.sessionId = 1;
    storage.set("annotinder:unsent-units:1", "not json");
    expect(unsent.read()).toEqual([]);
    storage.set("annotinder:unsent-units:1", '{"not":"a list"}');
    expect(unsent.read()).toEqual([]);
    globalThis.localStorage.setItem = () => {
      throw new Error("full");
    };
    unsent.write([post(1)]);
    globalThis.localStorage.setItem = (k: string, v: string) => void storage.set(k, v);
  });
});

describe("an outbox that is disposed", () => {
  it("stops trying again: nothing more is sent", async () => {
    const { box, sent, item } = outbox({ retryMs: 5 });
    let attempts = 0;
    box.add(
      item("coder", "coder", async () => {
        attempts += 1;
        throw offline();
      }),
    );
    await tick();
    box.dispose();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(attempts).toBe(1);
    expect(sent).toEqual([]);
    await expect(box.flush()).rejects.toThrow("Saving has stopped");
  });

  it("goes on when it is resumed", async () => {
    const { box, sent, item } = outbox();
    let connected = false;
    box.add(
      item("coder", "coder", async () => {
        if (!connected) throw offline();
      }),
    );
    await tick();
    box.dispose();
    connected = true;
    box.resume();
    await box.flush();
    expect(sent).toEqual(["coder"]);
  });
});
