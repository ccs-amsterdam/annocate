// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { KeyboardProvider } from "./KeyboardProvider";
import { PRIORITY, type KeyPress } from "./controller";
import { useKeyScope, useKeyTargets, useMenuKeys } from "./hooks";
import { leaderActive } from "./leader";
import { filterMapping, lettersMapping, type KeyMapping, type KeyTarget } from "./mappings";

afterEach(cleanup);

/** A scope that uses the keys in `uses`, and tells what it got. */
function Scope({ uses, seen, priority }: { uses: string[]; seen: (press: KeyPress) => void; priority?: number }) {
  useKeyScope(
    (press) => {
      if (!uses.includes(press.key)) return false;
      seen(press);
      return true;
    },
    true,
    { priority },
  );
  return null;
}

function OpenMenu() {
  useMenuKeys(true);
  return null;
}

/** A key press on an element (or the page): false when the keyboard used it (the browser doesn't act on it). */
const press = (key: string, more: KeyboardEventInit = {}, on: Element | Window = window) =>
  fireEvent.keyDown(on, { key, ...more });

describe("the coding screen's keyboard, on a page", () => {
  it("offers a key pressed anywhere on the page to the scopes, and leaves one no scope uses to the browser", () => {
    const seen = vi.fn();
    render(
      <KeyboardProvider>
        <Scope uses={["1"]} seen={seen} />
        <p>Some text</p>
      </KeyboardProvider>,
    );
    expect(press("1", {}, screen.getByText("Some text"))).toBe(false);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(press("x")).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("the leader, then a command: the scope gets the next key as its Ctrl press", () => {
    const seen = vi.fn();
    render(
      <KeyboardProvider>
        <Scope uses={["8"]} seen={seen} />
      </KeyboardProvider>,
    );
    press("/");
    expect(leaderActive()).toBe(true);
    press("8");
    expect(leaderActive()).toBe(false);
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ key: "8", ctrlKey: true }));
  });

  it("typing in a text field is the field's: no scope gets the keys, and / is no leader there", () => {
    const seen = vi.fn();
    render(
      <KeyboardProvider>
        <Scope uses={["1", "8"]} seen={seen} />
        <input type="text" aria-label="answer" />
        <textarea aria-label="long answer" />
      </KeyboardProvider>,
    );
    for (const label of ["answer", "long answer"]) {
      const field = screen.getByLabelText(label);
      expect(press("1", {}, field)).toBe(true);
      expect(press("/", {}, field)).toBe(true);
      expect(leaderActive()).toBe(false);
      press("8", {}, field);
    }
    expect(seen).not.toHaveBeenCalled();
  });

  it("the leader works in a number's box (no / is typed there), and a slider's keys are the scopes'", () => {
    const seen = vi.fn();
    render(
      <KeyboardProvider>
        <Scope uses={["8", "ArrowRight"]} seen={seen} />
        <input type="number" aria-label="count" />
        <input type="range" aria-label="slider" />
      </KeyboardProvider>,
    );
    const box = screen.getByLabelText("count");
    // A digit typed in the box is the box's
    expect(press("8", {}, box)).toBe(true);
    expect(seen).not.toHaveBeenCalled();
    expect(press("/", {}, box)).toBe(false);
    expect(press("8", {}, box)).toBe(false);
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ key: "8", ctrlKey: true }));
    press("ArrowRight", {}, screen.getByLabelText("slider"));
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it("a held-down key chooses once: its repeats are dropped, those of an unused key are the browser's", () => {
    const seen = vi.fn();
    render(
      <KeyboardProvider>
        <Scope uses={["1"]} seen={seen} />
      </KeyboardProvider>,
    );
    press("1", { code: "Digit1" });
    expect(press("1", { code: "Digit1", repeat: true })).toBe(false);
    expect(seen).toHaveBeenCalledTimes(1);
    press("ArrowDown", { code: "ArrowDown" });
    expect(press("ArrowDown", { code: "ArrowDown", repeat: true })).toBe(true);
  });

  it("Space and Enter on a focused button are the button's, unless a scope uses them as a control's key", () => {
    const seen = vi.fn();
    const view = render(
      <KeyboardProvider>
        <Scope uses={["1"]} seen={seen} />
        <button type="button">Option</button>
      </KeyboardProvider>,
    );
    const button = screen.getByText("Option");
    expect(press(" ", {}, button)).toBe(true);
    expect(press("Enter", {}, button)).toBe(true);
    view.rerender(
      <KeyboardProvider>
        <Scope uses={[" "]} seen={seen} />
        <button type="button">Option</button>
      </KeyboardProvider>,
    );
    expect(press(" ", {}, screen.getByText("Option"))).toBe(false);
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ key: " ", onControl: true }));
  });

  it("scopes get a key by priority, the latest first among equals; a scope that is gone gets none", () => {
    const order: string[] = [];
    const view = render(
      <KeyboardProvider>
        <Scope uses={["1"]} seen={() => order.push("field")} />
        <Scope uses={["1"]} seen={() => order.push("later field")} />
        <Scope uses={["1"]} seen={() => order.push("editor")} priority={PRIORITY.editor} />
      </KeyboardProvider>,
    );
    press("1");
    expect(order).toEqual(["editor"]);
    view.rerender(
      <KeyboardProvider>
        <Scope uses={["1"]} seen={() => order.push("field")} />
        <Scope uses={["1"]} seen={() => order.push("later field")} />
      </KeyboardProvider>,
    );
    press("1");
    expect(order).toEqual(["editor", "later field"]);
  });

  it("an open menu or dialog keeps the answer keys from the question behind it", () => {
    const seen = vi.fn();
    const view = render(
      <KeyboardProvider>
        <Scope uses={["1", "Enter"]} seen={seen} />
        <OpenMenu />
      </KeyboardProvider>,
    );
    expect(press("1")).toBe(true);
    expect(press("Enter", { ctrlKey: true })).toBe(true);
    expect(seen).not.toHaveBeenCalled();
    view.rerender(
      <KeyboardProvider>
        <Scope uses={["1", "Enter"]} seen={seen} />
      </KeyboardProvider>,
    );
    expect(press("1")).toBe(false);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("stops listening when the coding screen is gone", () => {
    const seen = vi.fn();
    const view = render(
      <KeyboardProvider>
        <Scope uses={["1"]} seen={seen} />
      </KeyboardProvider>,
    );
    press("/");
    view.unmount();
    expect(leaderActive()).toBe(false);
    expect(press("1")).toBe(true);
    expect(seen).not.toHaveBeenCalled();
  });
});

const TOPICS: KeyTarget[] = [{ label: "Health" }, { label: "Housing" }, { label: "Sports" }];

/** A field whose options are chosen by key: shows each option's key, what is typed, and what still matches. */
function Options({ onChoose, filterable }: { onChoose: (label: string) => void; filterable?: boolean }) {
  const { keys, filter, matches } = useKeyTargets([TOPICS], (_, index) => onChoose(TOPICS[index].label), {
    filterable,
  });
  return (
    <ul>
      {TOPICS.map((topic, i) => (
        <li key={topic.label} data-testid={topic.label} data-key={keys[0][i] ?? ""} data-matches={matches[0][i]} />
      ))}
      <li data-testid="typed">{filter}</li>
    </ul>
  );
}

function field(mapping: KeyMapping, filterable = false) {
  const chosen: string[] = [];
  render(
    <KeyboardProvider mapping={mapping}>
      <Options onChoose={(label) => chosen.push(label)} filterable={filterable} />
    </KeyboardProvider>,
  );
  const keyOf = (label: string) => screen.getByTestId(label).dataset.key;
  const matching = () => TOPICS.map((t) => t.label).filter((l) => screen.getByTestId(l).dataset.matches === "true");
  return { chosen, keyOf, matching };
}

describe("a field's keys by mapping (useKeyTargets)", () => {
  it("letters: a key of two letters is typed letter by letter, and what it can still be stays lit", () => {
    const { chosen, keyOf, matching } = field(lettersMapping);
    expect([keyOf("Health"), keyOf("Housing"), keyOf("Sports")]).toEqual(["he", "ho", "s"]);
    press("s");
    expect(chosen).toEqual(["Sports"]);
    press("h");
    expect(chosen).toEqual(["Sports"]);
    expect(matching()).toEqual(["Health", "Housing"]);
    press("o");
    expect(chosen).toEqual(["Sports", "Housing"]);
    expect(matching()).toEqual(["Health", "Housing", "Sports"]);
  });

  it("letters: Backspace and Escape take back what was typed", () => {
    const { chosen, matching } = field(lettersMapping);
    press("h");
    press("Backspace");
    expect(matching()).toHaveLength(3);
    press("h");
    press("Escape");
    press("e");
    expect(chosen).toEqual([]);
  });

  it("type to filter: typing narrows the options, Enter chooses the first that matches", () => {
    const { chosen, matching } = field(filterMapping, true);
    press("h");
    press("o");
    expect(screen.getByTestId("typed").textContent).toBe("ho");
    expect(matching()).toEqual(["Housing"]);
    expect(press("Enter")).toBe(false);
    expect(chosen).toEqual(["Housing"]);
    expect(screen.getByTestId("typed").textContent).toBe("");
  });

  it("type to filter: a field that can't show what is typed uses numbers", () => {
    const { chosen, keyOf } = field(filterMapping);
    expect(keyOf("Housing")).toBe("2");
    press("h");
    expect(chosen).toEqual([]);
    press("2");
    expect(chosen).toEqual(["Housing"]);
  });

  it("keys with Ctrl, Alt or ⌘ never choose an option", () => {
    const { chosen } = field(lettersMapping);
    press("s", { ctrlKey: true });
    press("s", { altKey: true });
    press("s", { metaKey: true });
    expect(chosen).toEqual([]);
  });
});
