// @vitest-environment happy-dom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CoderKind, Invite, StudyResponse, StudyWrite } from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { CreateStudyDialog } from "../studyList/CreateStudyDialog";
import { StudySettings } from "../StudySettings";
import { CoderKindContext } from "./coderKind";
import { InvitationSettings } from "./InvitationSettings";

// Who codes (expert coders or a crowd) is the study's: chosen when it is
// made, changed in its Settings until its first deploy, and only said in
// the design's invitation form.

afterEach(cleanup);

const EXPERT_OPTION = /A link per coder/;
const CROWD_OPTION = /Max. nr of coders/;

describe("the invitation form", () => {
  /** The form in a study of this kind, keeping what it changes; `invite()` is the invitation as it is now. */
  function form(kind: CoderKind | null, start: Invite) {
    let latest = start;
    const changes = vi.fn();
    function Form() {
      const [invite, setInvite] = useState(start);
      latest = invite;
      const change = (next: Invite) => {
        changes(next);
        setInvite(next);
      };
      return (
        <CoderKindContext.Provider value={kind}>
          <InvitationSettings invite={invite} groups={[]} issues={[]} onChange={change} />
        </CoderKindContext.Provider>
      );
    }
    render(<Form />);
    return { invite: () => latest, changes };
  }

  it("shows only the options of the study's kind, and no way to choose the other", () => {
    form("expert", { mode: "coders", link: "per_coder" });
    expect(screen.getByText("Expert coders")).toBeTruthy();
    expect(screen.getByLabelText(EXPERT_OPTION)).toBeTruthy();
    expect(screen.queryByText(CROWD_OPTION)).toBeNull();
    expect(screen.queryAllByRole("radiogroup")).toHaveLength(0);
    expect(screen.queryByText(/Crowd \(one link\)/)).toBeNull();
    cleanup();

    form("crowd", { mode: "crowd" });
    expect(screen.getByText("Crowd (one link)")).toBeTruthy();
    expect(screen.getByText(CROWD_OPTION)).toBeTruthy();
    expect(screen.queryByLabelText(EXPERT_OPTION)).toBeNull();
  });

  it("a crowd can't be asked to sign in", () => {
    form("crowd", { mode: "crowd" });
    expect(screen.queryByText("Coders sign in")).toBeNull();
  });

  it("an invitation for the other kind: the study's options, and a button that replaces it", () => {
    const { invite, changes } = form("expert", { mode: "crowd", maxCoders: 5 });
    expect(screen.getByLabelText(EXPERT_OPTION)).toBeTruthy();
    expect(screen.queryByText(CROWD_OPTION)).toBeNull();
    // Nothing changes until the researcher does
    expect(changes).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use an invitation for expert coders" }));
    expect(invite()).toEqual({ mode: "coders", link: "per_coder" });
    expect(screen.queryByRole("button", { name: "Use an invitation for expert coders" })).toBeNull();
  });

  it("outside a study's editor: the options of the invitation's own kind", () => {
    form(null, { mode: "coders", link: "login" });
    expect(screen.getByLabelText(EXPERT_OPTION)).toBeTruthy();
  });
});

const study = (extra: Partial<StudyResponse> = {}): StudyResponse => ({
  id: 1,
  publicId: "abcdefghijkl",
  name: "News",
  archived: false,
  coderKind: "crowd",
  created: new Date(0),
  reopenMinutes: 1440,
  redirectUrls: {},
  ...extra,
});

/** A page with its own query cache, holding what the server would have answered. */
function withCache(page: React.ReactNode, cached: [unknown[], unknown][] = []) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  for (const [key, data] of cached) queryClient.setQueryData(key, data);
  render(<QueryClientProvider client={queryClient}>{page}</QueryClientProvider>);
}

describe("making a study", () => {
  it("asks who codes: no study without the choice, and the study is made with it", async () => {
    const createStudy = vi.fn(async (body: StudyWrite) => study({ name: body.name, coderKind: body.coderKind }));
    const client = { createStudy } as unknown as ResearcherApi;
    const onCreated = vi.fn();
    withCache(<CreateStudyDialog client={client} onClose={() => {}} onCreated={onCreated} />);
    fireEvent.change(screen.getByPlaceholderText(/Sentiment Analysis/), { target: { value: "Coding news" } });
    const create = screen.getByRole<HTMLButtonElement>("button", { name: "Create Study" });
    expect(create.disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /^Expert coders/ }));
    expect(create.disabled).toBe(false);
    fireEvent.click(create);
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(createStudy).toHaveBeenCalledWith({ name: "Coding news", archived: false, coderKind: "expert" });
  });
});

describe("a study's settings", () => {
  const STUDY = ["admin", "study", 1];
  function settings(deployment: object | null) {
    const updateStudy = vi.fn(async (_id: number, body: StudyWrite) => study({ ...body, archived: false }));
    const client = new Proxy({ studyId: 1, updateStudy } as Record<string, unknown>, {
      get: (target, key: string) => (key in target ? target[key] : () => new Promise(() => {})),
    }) as unknown as ResearcherApi;
    withCache(<StudySettings client={client} />, [
      [STUDY, study()],
      [[...STUDY, "deployment"], deployment],
      [[...STUDY, "designVersions"], []],
    ]);
    return updateStudy;
  }
  const kind = (name: RegExp) => screen.getByRole<HTMLButtonElement>("radio", { name });

  it("change who codes until the first deploy", async () => {
    const updateStudy = settings(null);
    expect(kind(/^Crowd/).getAttribute("aria-checked")).toBe("true");
    expect(kind(/^Expert coders/).disabled).toBe(false);
    fireEvent.click(kind(/^Expert coders/));
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(updateStudy).toHaveBeenCalled());
    expect(updateStudy.mock.calls[0]![1]).toMatchObject({ name: "News", coderKind: "expert" });
  });

  it("say that who codes is fixed once the study is deployed", () => {
    settings({ designVersionId: 3 });
    expect(kind(/^Crowd/).disabled).toBe(true);
    expect(kind(/^Expert coders/).disabled).toBe(true);
    expect(screen.getByText(/Fixed since the study's first deploy/)).toBeTruthy();
  });
});
