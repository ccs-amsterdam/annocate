import { Hono } from "hono";
import type { Server, Env } from "../context.js";
import { HttpError } from "../shared/http.js";
import { idParam, parseJson } from "../shared/request.js";
import { DomainRuleWriteSchema, DomainSchema, PlanWriteSchema } from "@annotinder/contracts";
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { domainPlans, plans, roles } from "../db/schema/index.js";
import { getSettings } from "../shared/accounts.js";
import { adminLogger, serverRole } from "../shared/adminQueries.js";

/** Plans (limits on what researchers may create) and the rules that give an email domain's users a plan or the researcher role. */
export function adminPlans(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();
  const log = adminLogger(db);

  /** Server roles of email domains (not of a user). */
  const domainRoles = and(serverRole, isNull(roles.userId));

  app.get("/admin/plans", async (c) => c.json(await db.select().from(plans).orderBy(asc(plans.name))));

  app.post("/admin/plans", async (c) => {
    const plan = await parseJson(c, PlanWriteSchema);
    const [row] = await db.insert(plans).values({ name: plan.name, limits: plan.limits }).returning();
    await log(c, "create plan", plan.name, plan.limits);
    return c.json(row, 201);
  });

  app.put("/admin/plans/:id", async (c) => {
    const plan = await parseJson(c, PlanWriteSchema);
    const [row] = await db
      .update(plans)
      .set({ name: plan.name, limits: plan.limits })
      .where(eq(plans.id, idParam(c, "id")))
      .returning();
    if (!row) throw new HttpError(404, "Plan not found");
    await log(c, "update plan", plan.name, plan.limits);
    return c.json(row);
  });

  app.delete("/admin/plans/:id", async (c) => {
    const id = idParam(c, "id");
    if ((await getSettings(db)).defaultPlanId === id)
      throw new HttpError(409, "This is the default plan: choose another default first");
    const [row] = await db.delete(plans).where(eq(plans.id, id)).returning({ name: plans.name });
    if (!row) throw new HttpError(404, "Plan not found");
    await log(c, "delete plan", row.name);
    return c.body(null, 204);
  });

  // A domain rule: a researcher role for users with an email address there, and/or their plan
  app.get("/admin/domains", async (c) => {
    const researcherDomains = await db
      .select({ domain: sql<string>`${roles.emailDomain}` })
      .from(roles)
      .where(and(domainRoles, isNotNull(roles.emailDomain)));
    const planned = new Map((await db.select().from(domainPlans)).map((d) => [d.domain, d.planId]));
    const researchers = new Set(researcherDomains.map((r) => r.domain));
    const domains = [...new Set([...researchers, ...planned.keys()])].sort();
    return c.json(
      domains.map((domain) => ({ domain, researcher: researchers.has(domain), planId: planned.get(domain) ?? null })),
    );
  });

  app.put("/admin/domains/:domain", async (c) => {
    const domain = DomainSchema.safeParse(c.req.param("domain"));
    if (!domain.success) throw new HttpError(400, "A domain like uni.nl or *.uni.nl");
    const rule = await parseJson(c, DomainRuleWriteSchema);
    await db.transaction(async (tx) => {
      await tx.delete(roles).where(and(domainRoles, eq(roles.emailDomain, domain.data)));
      if (rule.researcher)
        await tx
          .insert(roles)
          .values({ role: "researcher", emailDomain: domain.data, grantedBy: c.get("researcher").email });
      await tx.delete(domainPlans).where(eq(domainPlans.domain, domain.data));
      if (rule.planId !== null) await tx.insert(domainPlans).values({ domain: domain.data, planId: rule.planId });
    });
    await log(c, "domain", domain.data, rule);
    return c.json({ domain: domain.data, ...rule });
  });

  app.delete("/admin/domains/:domain", async (c) => {
    const domain = c.req.param("domain").toLowerCase();
    const deletedRoles = await db
      .delete(roles)
      .where(and(domainRoles, eq(roles.emailDomain, domain)))
      .returning({ id: roles.id });
    const deletedPlans = await db
      .delete(domainPlans)
      .where(eq(domainPlans.domain, domain))
      .returning({ domain: domainPlans.domain });
    if (deletedRoles.length + deletedPlans.length === 0) throw new HttpError(404, "No such domain");
    await log(c, "delete domain", domain);
    return c.body(null, 204);
  });

  return app;
}
