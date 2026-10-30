import { expect, type APIRequestContext, type Page } from "@playwright/test";
import type { AnnotationRow, CoderProgress, JobResponse } from "@annotinder/contracts";

/** The researcher API, as the development user (the test server takes development auth headers). */
export const DEV_HEADERS = { "x-dev-role": "ADMIN", "x-dev-email": "dev@example.com", "content-type": "application/json" };

export async function api<T>(request: APIRequestContext, method: string, path: string, data?: unknown): Promise<T> {
  const res = await request.fetch(path, { method, headers: DEV_HEADERS, data: data === undefined ? undefined : JSON.stringify(data) });
  expect(res.ok(), `${method} ${path}: ${res.status()} ${await res.text()}`).toBe(true);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** A new job from an example, and the link of its (first) invitation. */
export async function fromExample(request: APIRequestContext, example: string): Promise<{ job: JobResponse; link: string }> {
  const job = await api<JobResponse>(request, "POST", "/job/from-example", { example });
  const [invite] = await api<{ secret: string }[]>(request, "GET", `/job/${job.id}/invites`);
  return { job, link: `/?deployment=${job.id}&invite=${invite.secret}` };
}

export async function answers(request: APIRequestContext, jobId: number): Promise<AnnotationRow[]> {
  return (await api<{ annotations: AnnotationRow[] }>(request, "GET", `/job/${jobId}/annotations?limit=10000`)).annotations;
}

export async function coders(request: APIRequestContext, jobId: number): Promise<CoderProgress[]> {
  return api<CoderProgress[]>(request, "GET", `/job/${jobId}/coders`);
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
