// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AdminUser, Limits, Plan, PlanWrite } from "@annotinder/contracts";
import type { ServerApi } from "../../../api/serverApi";
import { PlansTab } from "./PlansTab";
import { LimitsDialog } from "./UsersTab";

// Whether a crowd's coders can sign in (`Limits.crowdSignIn`): a plan's
// setting, shown and saved with its limits, and a user's own on top.

afterEach(cleanup);

const LABEL = "Crowd coders can sign in";

describe("a plan", () => {
  /** The Plans page of a server with this plan; resolves with what saving sends. */
  async function plansPage(plan: Plan) {
    const updatePlan = vi.fn(async (_id: number, body: PlanWrite) => ({ id: plan.id, ...body }));
    const server = {
      listPlans: async () => [plan],
      getSettings: async () => ({ defaultPlanId: plan.id }),
      updatePlan,
    } as unknown as ServerApi;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <PlansTab server={server} />
      </QueryClientProvider>,
    );
    const box = await screen.findByLabelText<HTMLInputElement>(LABEL);
    return { box, updatePlan };
  }
  const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));

  it("shows the setting off unless the plan has it on, and saves it with the limits", async () => {
    const { box, updatePlan } = await plansPage({ id: 1, name: "Default", limits: { studies: 20 } });
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    save();
    await waitFor(() => expect(updatePlan).toHaveBeenCalled());
    expect(updatePlan.mock.calls[0]![1]).toMatchObject({ name: "Default", limits: { studies: 20, crowdSignIn: true } });
  });

  it("turns it off again", async () => {
    const { box, updatePlan } = await plansPage({ id: 1, name: "Panels", limits: { crowdSignIn: true } });
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    save();
    await waitFor(() => expect(updatePlan).toHaveBeenCalled());
    expect(updatePlan.mock.calls[0]![1].limits.crowdSignIn).toBe(false);
  });
});

describe("a user's own limits", () => {
  function dialog(limits: Limits, effectiveLimits: Limits) {
    const onSave = vi.fn<(limits: Limits) => void>();
    const user = { email: "r@uni.nl", limits, effectiveLimits } as AdminUser;
    render(<LimitsDialog user={user} planName="Default" onClose={() => {}} onSave={onSave} />);
    const choice = screen.getByLabelText<HTMLSelectElement>(LABEL);
    const choose = (value: string) => {
      fireEvent.change(choice, { target: { value } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      return onSave.mock.calls.at(-1)![0];
    };
    return { choice, choose };
  }

  it("take the plan's setting unless the user has their own, and say what applies now", () => {
    const { choice, choose } = dialog({}, { crowdSignIn: true });
    expect(choice.value).toBe("");
    expect(screen.getByText("now yes")).toBeTruthy();
    expect(choose("")).toEqual({});
    expect(choose("off")).toEqual({ crowdSignIn: false });
    expect(choose("on")).toEqual({ crowdSignIn: true });
  });

  it("show the user's own setting, and go back to the plan's", () => {
    const { choice, choose } = dialog({ crowdSignIn: false, studies: 3 }, { crowdSignIn: false, studies: 3 });
    expect(choice.value).toBe("off");
    expect(screen.getByText("now no")).toBeTruthy();
    expect(choose("")).toEqual({ studies: 3 });
  });
});
