import { request } from "@playwright/test";
import type { Plan } from "@annotinder/contracts";
import { DEV_HEADERS } from "./helpers";

// The tests make more jobs than the default plan allows one account (20):
// lift that limit for the development user, as an admin would.
export default async function globalSetup(): Promise<void> {
  const api = await request.newContext({ baseURL: `http://localhost:${process.env.E2E_PORT ?? 8799}`, extraHTTPHeaders: DEV_HEADERS });
  const plans = (await (await api.get("/admin/plans")).json()) as Plan[];
  for (const plan of plans) {
    const res = await api.put(`/admin/plans/${plan.id}`, { data: { name: plan.name, limits: { ...plan.limits, jobs: null } } });
    if (!res.ok()) throw new Error(`Lifting the job limit of plan ${plan.name}: ${res.status()} ${await res.text()}`);
  }
  await api.dispose();
}
