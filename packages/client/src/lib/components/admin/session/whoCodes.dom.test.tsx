// @vitest-environment happy-dom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  CoderKind,
  CoderResponse,
  DeleteCoders,
  Invite,
  SessionItem,
  StudyResponse,
  StudyWrite,
} from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { UnusedExpertsNotice } from "../coders/UnusedExpertsNotice";
import { CreateStudyDialog } from "../studyList/CreateStudyDialog";
import { SessionItemForm } from "../SessionItemForm";
import { StudySettings } from "../StudySettings";
import { CoderKindContext } from "./coderKind";
import { InvitationSettings } from "./InvitationSettings";

// Who codes (expert coders or a crowd) is the design's: chosen and changed
// in its invitation form (two cards) until the study's first deploy, which
// fixes it. Making a study and its Settings don't ask.

afterEach(cleanup);

const EXPERT_OPTION = /A link per coder/;
const CROWD_OPTION = /Max. nr of coders/;
const STUDY = ["admin", "study", 1];

const expert = (coder: string, email: string | null = null): CoderResponse => ({
  id: 1,
  coder,
  kind: "expert",
  email,
  created: new Date(0),
  assigned: null,
  assignedDraft: 0,
  draftDiffers: false,
  done: 0,
  remaining: null,
  sessions: 0,
  lastActive: null,
});

/** A page with its own query cache, holding what the server would have answered. */
function withCache(page: React.ReactNode, cached: [unknown[], unknown][] = []) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  for (const [key, data] of cached) queryClient.setQueryData(key, data);
  render(<QueryClientProvider client={queryClient}>{page}</QueryClientProvider>);
}

/** A client that answers only these calls: the others never do, so a page shows what is in the cache. */
const clientWith = (calls: Record<string, unknown>) =>
  new Proxy({ studyId: 1, ...calls } as Record<string, unknown>, {
    get: (target, key: string) => (key in target ? target[key] : () => new Promise(() => {})),
  }) as unknown as ResearcherApi;

const codersCache = (coders: CoderResponse[]): [unknown[], unknown] => [
  [...STUDY, "coders"],
  { coders, unassigned: { live: null, draft: 0 } },
];

const card = (name: RegExp) => screen.getByRole("radio", { name });

describe("the invitation form", () => {
  /**
   * The form in a study whose first deploy fixed this kind (null: not
   * deployed yet), keeping what it changes; `invite()` is the invitation as
   * it is now.
   */
  function form(fixed: CoderKind | null, start: Invite | null, client?: ResearcherApi, coders: CoderResponse[] = []) {
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
        <CoderKindContext.Provider value={fixed}>
          <InvitationSettings invite={invite} groups={[]} issues={[]} client={client} onChange={change} />
        </CoderKindContext.Provider>
      );
    }
    withCache(<Form />, [codersCache(coders)]);
    return { invite: () => latest, changes };
  }

  it("a new design has no invitation: two cards to choose from, and no options yet", () => {
    const { invite, changes } = form(null, null);
    expect(card(/^Expert coders/).getAttribute("aria-checked")).toBe("false");
    expect(card(/^Crowd/).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText(/Choose who codes/)).toBeTruthy();
    expect(screen.queryByLabelText(EXPERT_OPTION)).toBeNull();
    expect(screen.queryByText(CROWD_OPTION)).toBeNull();
    expect(changes).not.toHaveBeenCalled();

    fireEvent.click(card(/^Expert coders/));
    expect(invite()).toEqual({ mode: "coders", link: "per_coder" });
    expect(card(/^Expert coders/).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByLabelText(EXPERT_OPTION)).toBeTruthy();
  });

  it("until the first deploy the kind can be changed: the other card starts that kind's invitation", () => {
    const { invite, changes } = form(null, { mode: "coders", link: "login" });
    expect(screen.getByText(/until the study's first deploy/)).toBeTruthy();
    // The kind it has is no change
    fireEvent.click(card(/^Expert coders/));
    expect(changes).not.toHaveBeenCalled();
    fireEvent.click(card(/^Crowd/));
    expect(invite()).toEqual({ mode: "crowd" });
    expect(screen.getByText(CROWD_OPTION)).toBeTruthy();
    expect(screen.queryByLabelText(EXPERT_OPTION)).toBeNull();
    fireEvent.click(card(/^Expert coders/));
    expect(invite()).toEqual({ mode: "coders", link: "per_coder" });
  });

  it("switching to a crowd while the study has expert coders: says they aren't used, and can delete them", async () => {
    const deleteCoders = vi.fn(async (select: DeleteCoders) => ({ sessionIds: [], answers: 0, coders: select.coders }));
    const client = clientWith({ deleteCoders });
    form(null, { mode: "coders", link: "per_coder" }, client, [expert("anna", "anna@example.org"), expert("bob")]);
    expect(screen.queryByText(/aren't used by this design/)).toBeNull();
    fireEvent.click(card(/^Crowd/));
    expect(screen.getByText("2 expert coders (with email addresses) aren't used by this design.")).toBeTruthy();
    // Deleting asks first
    fireEvent.click(screen.getByRole("button", { name: "Delete them" }));
    expect(deleteCoders).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete for good" }));
    await waitFor(() => expect(deleteCoders).toHaveBeenCalledWith({ coders: ["anna", "bob"] }));
  });

  it("a crowd's form without expert coders says nothing about them", () => {
    form(null, { mode: "crowd" }, clientWith({}));
    expect(screen.queryByText(/used by this design/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete them" })).toBeNull();
  });

  it("after the first deploy the kind is fixed: only its options, and no way to choose the other", () => {
    form("expert", { mode: "coders", link: "per_coder" });
    expect(screen.getByText("Expert coders")).toBeTruthy();
    expect(screen.getByText(/Fixed since the first deploy/)).toBeTruthy();
    expect(screen.getByLabelText(EXPERT_OPTION)).toBeTruthy();
    expect(screen.queryByText(CROWD_OPTION)).toBeNull();
    expect(screen.queryAllByRole("radiogroup")).toHaveLength(0);
    expect(screen.queryByText(/Crowd \(one link\)/)).toBeNull();
    cleanup();

    form("crowd", { mode: "crowd" });
    expect(screen.getByText("Crowd (one link)")).toBeTruthy();
    expect(screen.getByText(/Fixed since the first deploy/)).toBeTruthy();
    expect(screen.getByText(CROWD_OPTION)).toBeTruthy();
    expect(screen.queryByLabelText(EXPERT_OPTION)).toBeNull();
    expect(screen.queryAllByRole("radiogroup")).toHaveLength(0);
  });

  it("a crowd can't be asked to sign in", () => {
    form("crowd", { mode: "crowd" });
    expect(screen.queryByText("Coders sign in")).toBeNull();
  });

  it("fixed, with an invitation for the other kind or none: not its options, and a button for the study's kind", () => {
    const { invite, changes } = form("expert", { mode: "crowd", maxCoders: 5 });
    expect(screen.queryByText(CROWD_OPTION)).toBeNull();
    expect(screen.queryByLabelText(EXPERT_OPTION)).toBeNull();
    // Nothing changes until the researcher does
    expect(changes).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use an invitation for expert coders" }));
    expect(invite()).toEqual({ mode: "coders", link: "per_coder" });
    expect(screen.getByLabelText(EXPERT_OPTION)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Use an invitation for expert coders" })).toBeNull();
    cleanup();

    const none = form("crowd", null);
    fireEvent.click(screen.getByRole("button", { name: "Use a crowd's invitation" }));
    expect(none.invite()).toEqual({ mode: "crowd" });
  });
});

describe("who codes in a study without units", () => {
  const sessionForm = (item: SessionItem) =>
    withCache(<SessionItemForm item={item} groups={[]} issues={[]} client={clientWith({})} onChange={() => {}} />, [
      [[...STUDY, "units"], []],
      codersCache([]),
    ]);

  it("a new design shows the two cards at once: the choice isn't folded away", () => {
    sessionForm({ type: "session" });
    expect(screen.queryByText(/This study has no units yet/)).toBeNull();
    expect(card(/^Expert coders/)).toBeTruthy();
  });

  it("once chosen, how coders get in is folded under the notice about units", () => {
    sessionForm({ type: "session", invite: { mode: "crowd" } });
    expect(screen.getByText(/This study has no units yet/)).toBeTruthy();
    expect(screen.getByText(/Show the settings anyway/).closest("details")?.open).toBe(false);
  });
});

describe("expert coders a design doesn't use", () => {
  const notice = (kind: CoderKind | null, coders: CoderResponse[]) =>
    withCache(<UnusedExpertsNotice client={clientWith({})} kind={kind} />, [codersCache(coders)]);

  it("are said on a crowd's design and on one that hasn't chosen, never on one with expert coders", () => {
    notice("crowd", [expert("anna"), expert("bob"), expert("carl")]);
    expect(screen.getByText("3 expert coders aren't used by this design.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete them" })).toBeTruthy();
    cleanup();
    notice(null, [expert("anna", "anna@example.org")]);
    expect(screen.getByText("1 expert coder (with an email address) isn't used by this design.")).toBeTruthy();
    cleanup();
    notice("expert", [expert("anna")]);
    expect(screen.queryByRole("status")).toBeNull();
    cleanup();
    notice("crowd", [{ ...expert("P1"), kind: "crowd" }]);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

const study = (extra: Partial<StudyResponse> = {}): StudyResponse => ({
  id: 1,
  publicId: "abcdefghijkl",
  name: "News",
  archived: false,
  coderKind: null,
  created: new Date(0),
  reopenMinutes: 1440,
  redirectUrls: {},
  ...extra,
});

describe("making a study", () => {
  it("asks for its name only: who codes is chosen in its design", async () => {
    const createStudy = vi.fn(async (body: StudyWrite) => study({ name: body.name }));
    const onCreated = vi.fn();
    withCache(<CreateStudyDialog client={clientWith({ createStudy })} onClose={() => {}} onCreated={onCreated} />);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    const create = screen.getByRole<HTMLButtonElement>("button", { name: "Create Study" });
    expect(create.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/Sentiment Analysis/), { target: { value: "Coding news" } });
    expect(create.disabled).toBe(false);
    fireEvent.click(create);
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(createStudy).toHaveBeenCalledWith({ name: "Coding news", archived: false });
  });
});

describe("a study's settings", () => {
  it("don't have who codes, before or after the first deploy", async () => {
    for (const deployed of [study(), study({ coderKind: "expert" })]) {
      const updateStudy = vi.fn(async (_id: number, body: StudyWrite) => study({ ...body, archived: false }));
      withCache(<StudySettings client={clientWith({ updateStudy })} />, [
        [STUDY, deployed],
        [[...STUDY, "designVersions"], []],
      ]);
      expect(screen.queryByRole("radio", { name: /Expert coders|Crowd/ })).toBeNull();
      expect(screen.queryByText("Who codes")).toBeNull();
      fireEvent.change(screen.getByDisplayValue("News"), { target: { value: "Renamed" } });
      fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
      await waitFor(() => expect(updateStudy).toHaveBeenCalled());
      expect(updateStudy.mock.calls[0]![1]).not.toHaveProperty("coderKind");
      cleanup();
    }
  });
});
