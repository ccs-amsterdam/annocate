import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CodeHomePage } from "./CodeHomePage";

describe("CodeHomePage", () => {
  it("offers a login where the server has one and nobody is logged in", () => {
    const logIn = /<button[^>]*>Log in<\/button>/;
    expect(renderToStaticMarkup(<CodeHomePage apiUrl="/api" canLogIn />)).toMatch(logIn);
    expect(renderToStaticMarkup(<CodeHomePage apiUrl="/api" />)).not.toMatch(logIn);
  });
});
