// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import type { NominalOption } from "@annotinder/contracts";
import { SwipeCard, SwipeProvider, SwipeSurface } from "./SwipeCard";

const OPTIONS: NominalOption[] = [{ value: "no" }, { value: "yes" }, { value: "unsure" }];
const CARD_WIDTH = 400;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  // (The surface keeps the pointer while it drags; the test's pointer is no real one)
  Element.prototype.setPointerCapture = () => {};
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** A swipe question on screen: the card (400 px wide) on its surface, with an answer pane that has a drag of its own. */
function shown(options = OPTIONS) {
  const onAnswer = vi.fn<(option: NominalOption) => void>();
  render(
    <SwipeProvider question="q1" options={options} onAnswer={onAnswer}>
      <SwipeSurface>
        <SwipeCard>The unit</SwipeCard>
        <div data-no-swipe="">
          <span>Resize handle</span>
        </div>
      </SwipeSurface>
    </SwipeProvider>,
  );
  const card = screen.getByText("The unit");
  Object.defineProperty(card, "offsetWidth", { value: CARD_WIDTH });
  /** The option the swipe answered with, once the card has flown off; null: none. */
  const answer = () => {
    act(() => void vi.advanceTimersByTime(2000));
    return onAnswer.mock.lastCall?.[0].value ?? null;
  };
  return { card, onAnswer, answer };
}

type PointerType = "pointerDown" | "pointerMove" | "pointerUp" | "pointerCancel";

/** A pointer event at a place and a time (ms). */
function pointer(type: PointerType, on: Element, at: { x: number; y: number; ms: number }) {
  const event = createEvent[type](on, { pointerId: 1, button: 0, clientX: at.x, clientY: at.y });
  Object.defineProperty(event, "timeStamp", { value: 1000 + at.ms });
  fireEvent(on, event);
}

/** Presses on `from`, moves by (`dx`, `dy`) in `ms`, and lets go (or the browser takes the gesture: `cancel`). */
function drag(from: Element, dx: number, dy: number, ms: number, end: "pointerUp" | "pointerCancel" = "pointerUp") {
  pointer("pointerDown", from, { x: 100, y: 300, ms: 0 });
  pointer("pointerMove", from, { x: 100 + dx / 2, y: 300 + dy / 2, ms: ms / 2 });
  pointer("pointerMove", from, { x: 100 + dx, y: 300 + dy, ms });
  pointer(end, from, { x: 100 + dx, y: 300 + dy, ms });
}

const SLOW = 2000;

describe("dragging a swipe card", () => {
  it("answers when released past 30% of the card's width: left the first option, right the second", () => {
    const left = shown();
    drag(left.card, -130, 0, SLOW);
    expect(left.answer()).toBe("no");
    cleanup();
    const right = shown();
    drag(right.card, 130, 0, SLOW);
    expect(right.answer()).toBe("yes");
  });

  it("springs back when released before that", () => {
    const { card, answer } = shown();
    drag(card, 110, 0, SLOW);
    expect(card.style.transform).toBe("");
    expect(answer()).toBeNull();
  });

  it("the card follows the drag, tilted, and the option shows on the surface", () => {
    const { card } = shown();
    pointer("pointerDown", card, { x: 100, y: 300, ms: 0 });
    pointer("pointerMove", card, { x: 160, y: 300, ms: 500 });
    expect(card.style.transform).toBe("translate(60px, 0px) rotate(3deg)");
    const label = document.querySelector("[data-swipe-surface] [aria-hidden] span")!;
    expect(label.textContent).toBe("yes");
    expect(label.parentElement!.style.opacity).toBe("0.5");
  });

  it("answers once the card has flown off, not before", () => {
    const { card, onAnswer } = shown();
    drag(card, 200, 0, SLOW);
    expect(onAnswer).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(219));
    expect(onAnswer).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it("a quick flick answers too, if it moved at least 40 px", () => {
    const flick = shown();
    drag(flick.card, -50, 0, 50);
    expect(flick.answer()).toBe("no");
    cleanup();
    const twitch = shown();
    drag(twitch.card, -30, 0, 10);
    expect(twitch.answer()).toBeNull();
  });

  it("a press that hardly moves is a click, not a drag", () => {
    const { card, answer } = shown();
    drag(card, 5, 3, 20);
    expect(card.style.transform).toBe("");
    expect(answer()).toBeNull();
  });

  it("up answers the third option after 120 px", () => {
    const short = shown();
    drag(short.card, 0, -110, SLOW);
    expect(short.answer()).toBeNull();
    cleanup();
    const far = shown();
    drag(far.card, 0, -125, SLOW);
    expect(far.answer()).toBe("unsure");
  });

  it("with two options a vertical move is scrolling: no swipe up, and none down", () => {
    const up = shown(OPTIONS.slice(0, 2));
    drag(up.card, 0, -300, SLOW);
    expect(up.card.style.transform).toBe("");
    expect(up.answer()).toBeNull();
    cleanup();
    const down = shown();
    drag(down.card, 0, 300, SLOW);
    expect(down.answer()).toBeNull();
  });

  it("anywhere on the surface starts a swipe, but not a part with a drag of its own (the answer pane's handle)", () => {
    const { card, answer } = shown();
    drag(screen.getByText("Resize handle"), 300, 0, SLOW);
    expect(card.style.transform).toBe("");
    expect(answer()).toBeNull();
    drag(document.querySelector("[data-swipe-surface]")!, 300, 0, SLOW);
    expect(answer()).toBe("yes");
  });

  it("a gesture the browser takes over (pointercancel) doesn't answer", () => {
    const { card, answer } = shown();
    drag(card, 300, 0, SLOW, "pointerCancel");
    expect(answer()).toBeNull();
  });

  it("only the main button drags", () => {
    const { card, answer } = shown();
    const event = createEvent.pointerDown(card, { pointerId: 1, button: 2, clientX: 100, clientY: 300 });
    fireEvent(card, event);
    pointer("pointerMove", card, { x: 400, y: 300, ms: SLOW });
    pointer("pointerUp", card, { x: 400, y: 300, ms: SLOW });
    expect(answer()).toBeNull();
  });
});
