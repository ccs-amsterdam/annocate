// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpResearcherApi } from "../../../api/httpResearcherApi";
import { ResearcherGate } from "./ResearcherGate";

// A login session that ends while the researcher is at work: the page and
// its unsaved edits stay, and a banner asks them to log in again.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ResearcherGate", () => {
  it("reports activity while logged in; when the session ends, keeps the page and asks to log in again", async () => {
    const asked: string[] = [];
    let loggedIn = true;
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      if (!loggedIn) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
      if (url === "/api/auth/activity") return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ email: "jane@uni.nl", linkNeeded: false }), { status: 200 });
    });
    const api = new HttpResearcherApi({ baseUrl: "/api" });
    render(<ResearcherGate client={api}>{() => <textarea defaultValue="unsaved edits" />}</ResearcherGate>);
    expect(await screen.findByDisplayValue("unsaved edits")).toBeTruthy();
    expect(asked).toEqual(["/api/me", "/api/auth/activity"]);

    loggedIn = false;
    await act(() => expect(api.forStudy(1).listLinks()).rejects.toMatchObject({ status: 401 }));
    expect(screen.getByRole("alert").textContent).toContain("Your login has ended");
    expect(screen.getByRole("button", { name: /Log in again/ })).toBeTruthy();
    expect(screen.getByDisplayValue("unsaved edits")).toBeTruthy();
  });

  it("says why a step-up login didn't work while staying logged in (no endless loop back to the provider)", async () => {
    window.history.replaceState(null, "", "/research?loginError=step_up_failed");
    vi.stubGlobal("fetch", async (url: string) =>
      url === "/api/auth/activity"
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify({ email: "jane@uni.nl", linkNeeded: false }), { status: 200 }),
    );
    render(<ResearcherGate client={new HttpResearcherApi({ baseUrl: "/api" })}>{() => <p>studies</p>}</ResearcherGate>);
    expect(await screen.findByText("studies")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("with a second factor");
    window.history.replaceState(null, "", "/");
  });
});
