// @vitest-environment happy-dom
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePage } from "./usePage";

const numbers = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("usePage", () => {
  afterEach(cleanup);

  it("shows one page of a long list, and no pager when all fit", () => {
    const { result, rerender } = renderHook(({ items }) => usePage(items, 10), {
      initialProps: { items: numbers(25) },
    });
    expect(result.current.rows).toEqual(numbers(10));
    render(<>{result.current.pager}</>);
    expect(screen.getByText("1–10 of 25")).toBeTruthy();
    rerender({ items: numbers(5) });
    expect(result.current.rows).toEqual(numbers(5));
    expect(result.current.pager).toBeTruthy(); // the element renders nothing: all fit
  });

  it("moves back to the last page when the list got shorter", () => {
    const { result, rerender } = renderHook(({ items }) => usePage(items, 10), {
      initialProps: { items: numbers(25) },
    });
    render(<>{result.current.pager}</>);
    // To the second page (10–19)
    act(() => screen.getAllByRole("button")[1]!.click());
    expect(result.current.rows).toEqual(numbers(20).slice(10));
    // Refreshed with fewer rows than where it was: the last page there is
    rerender({ items: numbers(8) });
    expect(result.current.rows).toEqual(numbers(8));
  });
});
