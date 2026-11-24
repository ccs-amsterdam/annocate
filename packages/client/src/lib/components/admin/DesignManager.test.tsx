import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DesignVersion, TopLevelItem } from "@annotinder/contracts";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import { startDraft } from "../../design/draft";
import type { DesignBackup } from "../../design/localBackup";
import { DesignManager } from "./DesignManager";

/** A client whose calls never answer: the pages render from what is in the query cache. */
const client = new Proxy({ studyId: 1 } as Record<string, unknown>, {
  get: (target, key: string) => (key in target ? target[key] : () => new Promise(() => {})),
}) as unknown as ResearcherApi;

const version = (id: number, immutable: boolean, title: string): DesignVersion => ({
  id,
  studyId: 1,
  note: null,
  formatVersion: 1,
  created: new Date(0),
  updated: new Date(0),
  updatedBy: null,
  revision: 1,
  immutable,
  valid: true,
  items: [{ type: "question", name: "consent", variable: { type: "confirm", question: "Agree?" } }] as TopLevelItem[],
  units: { fields: [] },
  session: { invite: { mode: "crowd" } },
  public: { title },
});

const study = ["admin", "study", 1] as const;

/** The query cache of a study with these versions, the first of them deployed. */
function cacheWith(versions: DesignVersion[]): QueryClient {
  // A failed query stays failed (in the browser it is tried again when the page opens)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
  queryClient.setQueryData([...study, "designVersions"], versions);
  queryClient.setQueryData([...study, "deployment"], { designVersionId: versions[0]?.id ?? null });
  for (const v of versions) queryClient.setQueryData([...study, "designVersion", v.id], v);
  return queryClient;
}

function render(queryClient: QueryClient, props: Partial<Parameters<typeof DesignManager>[0]> = {}): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <DesignManager client={client} {...props} />
    </QueryClientProvider>,
  );
}

describe("DesignManager", () => {
  const live = version(1, true, "Live title");
  const draft = version(2, false, "Draft title");

  it("opens the current version: the draft", () => {
    const html = render(cacheWith([live, draft]));
    expect(html).toContain("Draft v2 · not deployed");
    expect(html).toContain('value="Draft title"');
  });

  it("continues unsaved edits of a version that is no longer current on the draft, not read only", () => {
    const saved = startDraft(live).items;
    const items = saved.map((i) => (i.type === "session" ? { ...i, public: { title: "My unsaved title" } } : i));
    const restore: DesignBackup = { studyId: 1, designVersionId: 1, revision: 1, items, saved, at: 5 };
    const html = render(cacheWith([live, draft]), { restore });
    expect(html).toContain("Draft v2 · not deployed");
    expect(html).not.toContain("read only");
    expect(html).toContain('value="My unsaved title"');
  });

  it("continues unsaved edits of a draft that was deleted on the current version", () => {
    const saved = startDraft(draft).items;
    const restore: DesignBackup = { studyId: 1, designVersionId: 2, revision: 1, items: saved, saved, at: 5 };
    const html = render(cacheWith([live]), { restore });
    expect(html).not.toContain("Loading design");
    expect(html).toContain("v1 · live");
  });

  it("says so when a version can't be loaded, with a way to the current one", async () => {
    const queryClient = cacheWith([live, draft]);
    await queryClient.prefetchQuery({
      queryKey: [...study, "designVersion", 9],
      queryFn: () => Promise.reject(new Error("Design version not found")),
    });
    const html = render(queryClient, { initialVersionId: 9 });
    expect(html).toContain("Could not load the design: Design version not found");
    expect(html).toContain("Open the current version");
    expect(html).not.toContain("Loading design");
  });
});
