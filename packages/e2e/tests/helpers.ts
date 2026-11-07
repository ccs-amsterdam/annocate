import { expect, type APIRequestContext, type Page } from "@playwright/test";
import type { AnnotationRow, CoderProgress, StudyResponse } from "@annotinder/contracts";

/** The researcher API, as the development user (the test server takes development auth headers). */
export const DEV_HEADERS = { "x-dev-role": "ADMIN", "x-dev-email": "dev@example.com", "content-type": "application/json" };

export async function api<T>(request: APIRequestContext, method: string, path: string, data?: unknown): Promise<T> {
  const res = await request.fetch(`/api${path}`, { method, headers: DEV_HEADERS, data: data === undefined ? undefined : JSON.stringify(data) });
  expect(res.ok(), `${method} ${path}: ${res.status()} ${await res.text()}`).toBe(true);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** A new study from an example, and the link of its (first) link. */
export async function fromExample(request: APIRequestContext, example: string): Promise<{ study: StudyResponse; link: string }> {
  const study = await api<StudyResponse>(request, "POST", "/study/from-example", { example });
  const [invite] = await api<{ secret: string }[]>(request, "GET", `/study/${study.id}/links`);
  return { study, link: `/code/${study.id}?link=${invite.secret}` };
}

export async function answers(request: APIRequestContext, studyId: number): Promise<AnnotationRow[]> {
  return (await api<{ annotations: AnnotationRow[] }>(request, "GET", `/study/${studyId}/annotations?limit=10000`)).annotations;
}

export async function coders(request: APIRequestContext, studyId: number): Promise<CoderProgress[]> {
  return api<CoderProgress[]>(request, "GET", `/study/${studyId}/coders`);
}

/** Answers of coders who aren't example coders. */
export function ownAnswers(rows: AnswerLike[], examples: number[]): AnswerLike[] {
  return rows.filter((r) => !examples.includes(r.coderId));
}
type AnswerLike = { coderId: number };

/** Waits until the coding screen shows this question. */
export async function question(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.getByText(text).first()).toBeVisible();
}
