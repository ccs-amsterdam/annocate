import { expect, type APIRequestContext, type Page } from "@playwright/test";
import type { AnnotationRow, CoderProgress, StudyResponse } from "@annotinder/contracts";

/** The researcher API, as the development user (the test server takes development auth headers). */
export const DEV_HEADERS = {
  "x-dev-role": "ADMIN",
  "x-dev-email": "dev@example.com",
  "content-type": "application/json",
};

export async function api<T>(request: APIRequestContext, method: string, path: string, data?: unknown): Promise<T> {
  // A design's top-level end items go in a branch; who codes: a crowd, unless the test says otherwise
  const withInvite = (design: { session?: object }) => ({
    ...design,
    session: { invite: { mode: "crowd" }, ...design.session },
  });
  const items = (data as { items?: unknown })?.items;
  const recipeDesign = (data as { design?: { session?: object } })?.design;
  const body =
    method === "POST" && /\/design$/.test(path) && Array.isArray(items)
      ? {
          ...withInvite(data as { session?: object }),
          items: items.map((i) =>
            (i as { type?: string }).type === "end"
              ? { type: "branch", condition: { script: "true" }, children: [i] }
              : i,
          ),
        }
      : method === "POST" && path === "/study/from-recipe" && recipeDesign
        ? { ...(data as object), design: withInvite(recipeDesign) }
        : data;
  const res = await request.fetch(`/api${path}`, {
    method,
    headers: DEV_HEADERS,
    data: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(res.ok(), `${method} ${path}: ${res.status()} ${await res.text()}`).toBe(true);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** A new study from an example, and the link of its (first) link. */
export async function fromExample(
  request: APIRequestContext,
  example: string,
): Promise<{ study: StudyResponse; link: string }> {
  const study = await api<StudyResponse>(request, "POST", "/study/from-example", { example });
  const [link] = await api<{ secret: string }[]>(request, "GET", `/study/${study.id}/links`);
  return { study, link: `/code/${study.id}?link=${link.secret}` };
}

export async function answers(request: APIRequestContext, studyId: number): Promise<AnnotationRow[]> {
  return (await api<{ annotations: AnnotationRow[] }>(request, "GET", `/study/${studyId}/annotations?limit=10000`))
    .annotations;
}

export async function coders(request: APIRequestContext, studyId: number): Promise<CoderProgress[]> {
  return api<CoderProgress[]>(request, "GET", `/study/${studyId}/coders`);
}

/** Waits until the coding screen shows this question. */
export async function question(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.getByText(text).first()).toBeVisible();
}

/** Chooses a shortcut style in the coding screen's keyboard menu (`Fast type`, `Numpad`, ...). */
export async function shortcutStyle(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Keyboard shortcuts" }).click();
  await page.getByRole("button", { name: /^Shortcut style/ }).click();
  await page.getByRole("option", { name: new RegExp(`^${name}`) }).click();
  await page.keyboard.press("Escape");
}

/** A new design asks who codes first (the design page shows only that): choose. */
export async function chooseWhoCodes(page: Page, mode: "Crowd" | "Specific coders" = "Crowd"): Promise<void> {
  await page.getByRole("radio", { name: new RegExp(`^${mode}`) }).click();
  await expect(page.getByRole("button", { name: /Add item/ })).toBeVisible();
}
