// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { EndItem } from "@annotinder/contracts";
import type { SessionEnding } from "../studyManager/types";
import { SessionEnd } from "./SessionEnd";

function endingWith(redirectUrl: string | null, outcome: EndItem["outcome"] = "complete"): SessionEnding {
  return { item: { type: "end", name: "done", outcome } as EndItem, message: null, redirectUrl };
}

const PANEL = "https://panel.example/back?id=7";
let assign: ReturnType<typeof vi.fn<(url: string | URL) => void>>;

beforeEach(() => {
  vi.useFakeTimers();
  assign = vi.fn();
  vi.spyOn(window.location, "assign").mockImplementation(assign);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the end screen's redirect", () => {
  it("is followed by itself after 3 seconds; before that the coder can follow its link", () => {
    render(<SessionEnd ending={endingWith(PANEL)} />);
    expect(screen.getByText("Continue").getAttribute("href")).toBe(PANEL);
    vi.advanceTimersByTime(2999);
    expect(assign).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(assign).toHaveBeenCalledWith(PANEL);
  });

  it("is not followed once the screen is gone", () => {
    render(<SessionEnd ending={endingWith(PANEL)} />).unmount();
    vi.advanceTimersByTime(10_000);
    expect(assign).not.toHaveBeenCalled();
  });

  it("in a preview is shown, not followed", () => {
    render(<SessionEnd ending={endingWith(PANEL)} preview />);
    vi.advanceTimersByTime(10_000);
    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByText("Redirect (not followed in a preview)").getAttribute("href")).toBe(PANEL);
  });

  it("is only an http(s) address: another scheme is no redirect at all", () => {
    render(<SessionEnd ending={endingWith("javascript:alert(1)")} />);
    vi.advanceTimersByTime(10_000);
    expect(assign).not.toHaveBeenCalled();
    expect(screen.queryByText("Continue")).toBeNull();
    expect(screen.getByText("You can close this window now.")).toBeTruthy();
  });
});

describe("what the end screen says and offers", () => {
  it("how the session ended: finished, screened out, or quit", () => {
    render(<SessionEnd ending={null} />);
    expect(screen.getByText("Study Complete!")).toBeTruthy();
    cleanup();
    render(<SessionEnd ending={endingWith(null, "screenout")} />);
    expect(screen.getByText("Thank you")).toBeTruthy();
    expect(screen.getByText("This is the end of the study for you.")).toBeTruthy();
    cleanup();
    render(<SessionEnd ending={endingWith(null, "screenout")} quit />);
    expect(screen.getByText("You quit this study")).toBeTruthy();
  });

  it("going back to the answers, while the server allows it", () => {
    const onReopen = vi.fn(async () => {});
    render(<SessionEnd ending={null} reopen={{ until: null }} onReopen={onReopen} />);
    fireEvent.click(screen.getByText("Go back to my answers"));
    expect(onReopen).toHaveBeenCalledTimes(1);
    cleanup();
    render(<SessionEnd ending={null} reopen={null} onReopen={onReopen} />);
    expect(screen.queryByText(/Go back to my answers/)).toBeNull();
  });

  it("asking to delete the answers: offered until asked, and not in a preview", () => {
    const onRequestDeletion = vi.fn(async () => {});
    render(<SessionEnd ending={null} onRequestDeletion={onRequestDeletion} />);
    expect(screen.getByText("Ask to delete my answers")).toBeTruthy();
    cleanup();
    render(<SessionEnd ending={null} onRequestDeletion={onRequestDeletion} deletionRequested />);
    expect(screen.queryByText("Ask to delete my answers")).toBeNull();
    expect(screen.getByText("Your request to delete your answers was sent to the researchers.")).toBeTruthy();
    cleanup();
    render(<SessionEnd ending={null} onRequestDeletion={onRequestDeletion} preview />);
    expect(screen.queryByText("Ask to delete my answers")).toBeNull();
  });

  it("links the coder's studies, unless a redirect takes them elsewhere", () => {
    render(<SessionEnd ending={null} homeUrl="/code" />);
    expect(screen.getByText("Go to your studies").closest("a")!.getAttribute("href")).toBe("/code");
    cleanup();
    render(<SessionEnd ending={endingWith(PANEL)} homeUrl="/code" />);
    expect(screen.queryByText("Go to your studies")).toBeNull();
  });
});
