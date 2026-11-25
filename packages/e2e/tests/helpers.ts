import { expect, type APIRequestContext, type Page } from "@playwright/test";
import type { AnnotationRow, CoderProgress, StudyResponse } from "@annotinder/contracts";

/** The researcher API, as the development user (the test server takes development auth headers). */
export const DEV_HEADERS = {
  "x-dev-role": "ADMIN",
  "x-dev-email": "dev@example.com",
  "content-type": "application/json",
};

export async function api<T>(request: APIRequestContext, method: string, path: string, data?: unknown): Promise<T> {
  const items = (data as { items?: unknown })?.items;
  const newDesign = method === "POST" && /^\/study\/\d+\/design$/.test(path) && Array.isArray(items);
  // A design for expert coders: its study is made one with expert coders first
  const invite = (data as { session?: { invite?: { mode?: string } } })?.session?.invite;
  if (newDesign && invite?.mode === "coders") await haveExpertCoders(request, Number(path.split("/")[2]));
  // A design's top-level end items go in a branch
  const body = newDesign
    ? {
        ...(data as object),
        items: (items as unknown[]).map((i) =>
          (i as { type?: string }).type === "end"
            ? { type: "branch", condition: { script: "true" }, children: [i] }
            : i,
        ),
      }
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

/**
 * Makes a study one with expert coders, if it isn't (a study starts with a
 * crowd unless said): possible until its first deploy.
 */
async function haveExpertCoders(request: APIRequestContext, studyId: number): Promise<void> {
  const study = await api<StudyResponse>(request, "GET", `/study/${studyId}`);
  if (study.coderKind !== "expert")
    await api(request, "PUT", `/study/${studyId}`, { name: study.name, coderKind: "expert" });
}

/**
 * A list of the researcher API (`{ <items>: [...], next? }`): its items
 * (the tests' lists fit one page).
 */
export async function list<T>(request: APIRequestContext, path: string): Promise<T[]> {
  const page = await api<Record<string, unknown>>(request, "GET", path);
  const items = Object.values(page).find((value) => Array.isArray(value));
  expect(items, `GET ${path} is a list`).toBeDefined();
  return items as T[];
}

/** A new study from an example, and the link of its (first) link. */
export async function fromExample(
  request: APIRequestContext,
  example: string,
): Promise<{ study: StudyResponse; link: string }> {
  const study = await api<StudyResponse>(request, "POST", "/study/from-example", { example });
  const [link] = await list<{ secret: string }>(request, `/study/${study.id}/links`);
  return { study, link: `/code/${study.publicId}?link=${link.secret}` };
}

export async function answers(request: APIRequestContext, studyId: number): Promise<AnnotationRow[]> {
  return (await api<{ annotations: AnnotationRow[] }>(request, "GET", `/study/${studyId}/annotations?limit=10000`))
    .annotations;
}

/** The study's coder sessions, with their progress. */
export async function coders(request: APIRequestContext, studyId: number): Promise<CoderProgress[]> {
  return list<CoderProgress>(request, `/study/${studyId}/sessions`);
}

/** Makes expert coders of a study, by their ids: what a coder set (`coder_set`) may name. */
export async function addCoders(request: APIRequestContext, studyId: number, ids: string[]): Promise<void> {
  await api(request, "POST", `/study/${studyId}/coders`, { coders: ids.map((coder) => ({ coder })) });
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

/** In the Create New Study dialog: names the study, chooses who codes, and creates it. */
export async function createStudy(page: Page, name: string, coders: "Crowd" | "Expert coders"): Promise<void> {
  await page.getByPlaceholder(/Sentiment Analysis/).fill(name);
  await page.getByRole("radio", { name: new RegExp(`^${coders}`) }).click();
  await page.getByRole("button", { name: "Create Study" }).click();
}
