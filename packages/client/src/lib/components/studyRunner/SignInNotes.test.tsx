import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { offersSignInHere } from "../../session/coderSession";
import { SignInHereLine, SignInNotes } from "./SignInNotes";

const OFFER = "Sign in to continue from any device. The researchers don&#x27;t see your email address.";
const LOG_IN = /<button[^>]*>Log in<\/button>/;

describe("what Continue on another device says about signing in", () => {
  it("a coder who may sign in and hasn't: the offer, with Log in", () => {
    const html = renderToStaticMarkup(<SignInNotes login={null} canLogIn signIn="optional" />);
    expect(html).toContain(OFFER);
    expect(html).toMatch(LOG_IN);
  });

  it("where signing in isn't possible (a crowd's study, unless its owner's plan allows): nothing", () => {
    expect(renderToStaticMarkup(<SignInNotes login={null} canLogIn={false} signIn="none" />)).toBe("");
  });

  it("where sign-in is required: sign in on the other device, as the session's address", () => {
    const html = renderToStaticMarkup(<SignInNotes login="anna@uni.nl" canLogIn={false} signIn="required" />);
    expect(html).toContain("sign in on the other device");
    expect(html).toContain("sign in as <strong>anna@uni.nl</strong>");
    expect(html).not.toContain(OFFER);
    expect(html).not.toMatch(LOG_IN);
  });

  it("a session the coder chose to sign in for: choose Log in on the other device", () => {
    const html = renderToStaticMarkup(<SignInNotes login="c@example.org" canLogIn={false} signIn="optional" />);
    expect(html).toContain("choose <strong>Log in</strong> there");
    expect(html).toContain("log in as <strong>c@example.org</strong>");
    expect(html).not.toContain(OFFER);
  });
});

describe("a device that joined by a transfer link", () => {
  it("is told it can sign in here too, only where that is possible and the browser isn't logged in", () => {
    expect(offersSignInHere(true, "optional", false)).toBe(true);
    expect(offersSignInHere(true, "required", false)).toBe(true);
    // No signing in in this study (or on this server)
    expect(offersSignInHere(true, "none", false)).toBe(false);
    // Logged in already, or not known yet
    expect(offersSignInHere(true, "optional", true)).toBe(false);
    expect(offersSignInHere(true, "optional", null)).toBe(false);
    // A device that didn't come by a transfer link
    expect(offersSignInHere(false, "optional", false)).toBe(false);
  });

  it("the line: one sentence with Log in", () => {
    const html = renderToStaticMarkup(<SignInHereLine />);
    expect(html).toContain("Sign in here too to use your saved settings");
    expect(html).toMatch(LOG_IN);
  });
});
