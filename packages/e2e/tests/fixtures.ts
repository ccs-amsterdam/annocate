import { test as base, expect, type BrowserContext } from "@playwright/test";

// Every test fails on a Content Security Policy violation in any of its
// pages (the server's policy: server/src/shared/securityHeaders.ts), so the
// policy is checked against everything the tests do.

function watch(context: BrowserContext, violations: string[]) {
  context.on("console", (msg) => {
    if (/Content Security Policy|Refused to (load|execute|apply|frame|connect)/i.test(msg.text()))
      violations.push(msg.text());
  });
}

export const test = base.extend<{ cspViolations: string[] }>({
  cspViolations: [
    async ({ browser }, use) => {
      const violations: string[] = [];
      // Contexts a test makes itself (a coder's browser) are watched too
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (...args) => {
        const context = await newContext(...args);
        watch(context, violations);
        await context.addInitScript(() => localStorage.setItem("annotinder_answer_keys", "true"));
        return context;
      };
      await use(violations);
      browser.newContext = newContext;
      expect(violations, "Content Security Policy violations").toEqual([]);
    },
    { auto: true },
  ],
  context: async ({ context, cspViolations }, use) => {
    watch(context, cspViolations);
    // The tests answer with keys: turned on, as a coder would (off by default)
    await context.addInitScript(() => localStorage.setItem("annotinder_answer_keys", "true"));
    await use(context);
  },
});

export { expect };
