import { describe, expect, it } from "vitest";
import type { UnitData } from "@annotinder/contracts";
import { and, eq, isNull } from "drizzle-orm";
import { annotationValues } from "../db/schema/index.js";
import { unitVersionData } from "../db/sql.js";
import { query } from "./testDb.js";

import {
  adminHeaders,
  db,
  server,
  coder,
  demo,
  unitByExternalId,
  redeploy,
  deployDrafts,
  draftUnit,
} from "./coderHarness.js";

describe("unit versions", () => {
  const versionOf = async (unitId: number) =>
    (
      await db
        .select({ data: unitVersionData(annotationValues.unitVersionId) })
        .from(annotationValues)
        .where(and(eq(annotationValues.unitId, unitId), isNull(annotationValues.retiredAt)))
        .limit(1)
    )[0]?.data;
  const upload = (units: object[], extra: object) =>
    server.request("/api/study/1/units", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ units, ...extra }),
    });

  it("records the version of a unit each coder saw, also when it changed after it was served", async () => {
    const c = coder("hash");
    const first = (await c.next())!;
    await c.submit(first.id, demo("neutral"));
    expect(await versionOf(first.id)).toMatchObject(first.data);

    const second = (await c.next())!;
    const before = await draftUnit(second.id);
    // The researcher replaces it while the coder has it open (not coded yet).
    expect(
      (await upload([{ externalId: before.externalId, data: { ...before.data, text: "edited" } }], { overwrite: true }))
        .status,
    ).toBe(201);
    expect((await c.submit(second.id, demo("neutral"))).status).toBe(200);
    expect((await versionOf(second.id))?.text).toBe(before.data.text);
  });

  it("replaces a coded unit only when asked to; its answers keep the version their coder saw", async () => {
    const a = coder("a");
    const unit = (await a.next())!;
    await a.submit(unit.id, demo("neutral"));
    const row = await draftUnit(unit.id);
    const edited = [{ externalId: row.externalId, data: { ...row.data, text: "edited" } }];

    expect((await upload(edited, { overwrite: true })).status).toBe(409);
    expect((await upload(edited, { overwrite: true, overwriteCoded: true })).status).toBe(201);
    await deployDrafts();
    // The next coder sees the new text; the first answer still has the old one.
    expect((await coder("b").next())!.data.text).toBe("edited");
    expect((await versionOf(unit.id))?.text).toBe(row.data.text);

    const page = (await (await server.request("/api/study/1/unit-versions", { headers: adminHeaders })).json()) as {
      versions: { unitId: number; data: UnitData }[];
    };
    expect(page.versions.filter((v) => v.unitId === unit.id).map((v) => v.data.text)).toEqual([
      row.data.text,
      "edited",
    ]);
  });

  it("sends coders only the unit fields the design uses", async () => {
    expect((await upload([{ externalId: "secret", data: { headline: "h", text: "t" } }], {})).status).toBe(201);
    await redeploy({ layout: { template: "$unit.headline" } });
    const unit = (await coder("c").next())!;
    expect(Object.keys(unit.data)).toEqual(["headline"]);
  });
});

describe("unit versions are made by deploys", () => {
  const count = async (sql: string, params: unknown[] = []) => (await query<{ n: number }>(db, sql, params))[0].n;
  const upload = async (units: object[]) => {
    const res = await server.request("/api/study/1/units", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ units, overwrite: true, overwriteCoded: true }),
    });
    expect(res.status, await res.clone().text()).toBe(201);
  };

  it("keeps only deployed content: draft edits make no versions, and a replaced version nobody coded goes", async () => {
    const id = (await unitByExternalId("unit-1")).id;
    const { data } = await draftUnit(id);
    const versions = () => count("SELECT COUNT(*)::int AS n FROM unit_versions WHERE unit_id = $1", [id]);
    const value = (text: string) =>
      count("SELECT COUNT(*)::int AS n FROM unit_values WHERE study_id = 1 AND value = to_jsonb($1::text)", [text]);
    expect(await versions()).toBe(1);
    // Edited twice in the draft: no versions, and the first edit's value is gone
    await upload([{ externalId: "unit-1", data: { ...data, text: "first edit" } }]);
    await upload([{ externalId: "unit-1", data: { ...data, text: "second edit" } }]);
    expect(await versions()).toBe(1);
    expect(await value("first edit")).toBe(0);
    // Deployed: a new version; the old one, never coded, is gone
    await deployDrafts();
    expect(await versions()).toBe(1);
    expect((await draftUnit(id)).data.text).toBe("second edit");
    // Coded, then replaced and deployed: the coded version stays
    const c = coder("v");
    const unit = (await c.next())!;
    expect(unit.data.text).toBe("second edit");
    await c.submit(unit.id, demo("neutral"));
    await upload([{ externalId: "unit-1", data: { ...data, text: "third edit" } }]);
    await deployDrafts();
    expect(await versions()).toBe(2);
    expect(await value("second edit")).toBe(1);
  });
});
