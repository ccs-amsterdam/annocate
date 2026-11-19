import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "./fixtures";
import type { StudyResponse } from "@annotinder/contracts";
import { api } from "./helpers";

// Connecting an AI assistant (docs/api/mcp.md): the assistant registers and
// sends the researcher to the consent page; they pick a study and allow it;
// the assistant gets tokens and saves a draft of the design over MCP.

const REDIRECT = "https://assistant.example/callback";

test("an AI assistant is allowed on the consent page, then saves a draft of the study's design", async ({ page, request }) => {
  const study = await api<StudyResponse>(request, "POST", "/study", { name: "Assistant study" });

  // The assistant registers and starts authorizing (PKCE)
  const registered = await request.post("/api/oauth/register", { data: { client_name: "Test assistant", redirect_uris: [REDIRECT] } });
  const { client_id: clientId } = (await registered.json()) as { client_id: string };
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "s1",
    scope: "design:read design:edit",
  });

  // The browser comes back to the assistant: catch that instead of leaving the test server
  let returned: URL | null = null;
  await page.route("https://assistant.example/**", async (route) => {
    returned = new URL(route.request().url());
    await route.fulfill({ status: 200, body: "back at the assistant" });
  });

  await page.goto(`/api/oauth/authorize?${query}`);
  await expect(page).toHaveURL(/\/research\/connect\?request=/);
  await expect(page.getByRole("heading", { name: "Connect an AI assistant" })).toBeVisible();
  await expect(page.getByText("Test assistant", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Assistant study" }).check();
  await page.getByRole("button", { name: "Allow" }).click();
  await expect(page.getByText("back at the assistant")).toBeVisible();
  expect(returned!.searchParams.get("state")).toBe("s1");
  const code = returned!.searchParams.get("code")!;

  // Tokens for the code
  const tokenRes = await request.post("/api/oauth/token", {
    form: { grant_type: "authorization_code", code, code_verifier: verifier, client_id: clientId, redirect_uri: REDIRECT },
  });
  expect(tokenRes.status()).toBe(200);
  const { access_token: accessToken } = (await tokenRes.json()) as { access_token: string };

  // A draft, over MCP
  const mcp = await request.post("/api/mcp", {
    headers: { authorization: `Bearer ${accessToken}` },
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "save_design_draft",
        arguments: { design: { items: [{ type: "question", name: "tone", variable: { type: "confirm", question: "Is it positive?" } }] } },
      },
    },
  });
  expect(((await mcp.json()) as { result: { structuredContent: { saved: boolean } } }).result.structuredContent.saved).toBe(true);
  const versions = await api<{ updatedBy: string }[]>(request, "GET", `/study/${study.id}/design`);
  expect(versions.at(-1)!.updatedBy).toContain("via Test assistant");
});
