import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteOutboxStore } from "../outboxSqlite.js";

describe("SqliteOutboxStore", () => {
  const dir = mkdtempSync(join(tmpdir(), "outbox-"));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("keeps pending writes per deployment, in order, across reopening", () => {
    const path = join(dir, "outbox.sqlite");
    const store = new SqliteOutboxStore(path);
    const write = (unitId: number) => ({ kind: "annotation" as const, write: { unitId, coderId: 1, variables: {} } });
    store.append("a.1", write(1), 100);
    store.append("b.1", write(2), 150);
    store.append("a.1", write(3), 200);

    const reopened = new SqliteOutboxStore(path); // a restart
    expect(reopened.deployments().sort()).toEqual(["a.1", "b.1"]);
    const pending = reopened.pending("a.1", 10);
    expect(pending.map((e) => (e.write.kind === "annotation" ? e.write.write.unitId : null))).toEqual([1, 3]);
    expect(reopened.stats("a.1")).toEqual({ pending: 2, oldestAt: 100 });

    reopened.remove([pending[0].id]);
    expect(reopened.stats("a.1")).toEqual({ pending: 1, oldestAt: 200 });
    expect(reopened.stats("c.1")).toEqual({ pending: 0, oldestAt: null });
  });
});
