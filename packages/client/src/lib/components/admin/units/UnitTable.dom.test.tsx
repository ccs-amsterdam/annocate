// @vitest-environment happy-dom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UnitField, UnitResponse } from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { Pager } from "./Pager";
import { UnitTable } from "./UnitTable";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FIELDS = [
  { name: "headline", type: "text" },
  { name: "words", type: "number" },
  { name: "people", type: "list" },
] as UnitField[];

const unit = (id: number, data: UnitResponse["data"] = {}, coded = false): UnitResponse => ({
  id,
  externalId: `u${id}`,
  data,
  coded,
});

/** The units table on one page of units, with a selection that may hold units of other pages. */
function table(units: UnitResponse[], selectedBefore: number[] = []) {
  let selection = new Set(selectedBefore);
  const deleted: number[] = [];
  const client = {
    studyId: 1,
    deleteUnit: async (id: number) => void deleted.push(id),
    getUnit: async (id: number) => units.find((u) => u.id === id),
  } as unknown as ResearcherApi;
  function Table() {
    const [selected, setSelected] = useState(selection);
    selection = selected;
    return (
      <UnitTable
        client={client}
        units={units}
        fields={FIELDS}
        groups={["test_set"]}
        cells={new Map([["test_set", new Map([[2, "practice # intro"]])]])}
        selected={selected}
        onSelectedChange={setSelected}
        loading={false}
      />
    );
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Table />
    </QueryClientProvider>,
  );
  const row = (externalId: string) => within(screen.getByText(externalId).closest("tr")!);
  return { selected: () => [...selection].sort((a, b) => a - b), deleted, row };
}

describe("the units table", () => {
  it("selects units one by one, and all of the page at once", () => {
    const { selected } = table([unit(1), unit(2), unit(3)]);
    const all = screen.getByLabelText<HTMLInputElement>("Select all units on this page");
    fireEvent.click(screen.getByLabelText("Select u2"));
    expect(selected()).toEqual([2]);
    expect(all.checked).toBe(false);
    fireEvent.click(all);
    expect(selected()).toEqual([1, 2, 3]);
    expect(screen.getByLabelText<HTMLInputElement>("Select all units on this page").checked).toBe(true);
    fireEvent.click(screen.getByLabelText("Select u1"));
    expect(selected()).toEqual([2, 3]);
  });

  it("selecting or clearing a page keeps the units selected on other pages", () => {
    const { selected } = table([unit(1), unit(2)], [7, 8]);
    const all = () => screen.getByLabelText("Select all units on this page");
    fireEvent.click(all());
    expect(selected()).toEqual([1, 2, 7, 8]);
    fireEvent.click(all());
    expect(selected()).toEqual([7, 8]);
  });

  it("shows a list field as its labels, a missing value as –, and a unit's role column", () => {
    const { row } = table([
      unit(1, { headline: "Storm hits coast", words: 120, people: ["Lena", { value: "p2", label: "Tom" }] }),
      unit(2, { headline: "Quiet day" }),
    ]);
    const cells = (externalId: string) =>
      row(externalId)
        .getAllByRole("cell")
        .map((cell) => cell.textContent);
    expect(cells("u1").slice(2, 6)).toEqual(["", "Storm hits coast", "120", "Lena; Tom"]);
    expect(cells("u2").slice(2, 6)).toEqual(["practice # intro", "Quiet day", "–", "–"]);
  });

  it("a coded unit can't be deleted; another is deleted after asking", async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    const { deleted, row } = table([unit(1, {}, true), unit(2)]);
    expect(row("u1").queryByTitle("Delete unit")).toBeNull();
    expect(row("u1").getByTitle(/^Coded: it can't be deleted/)).toBeTruthy();
    fireEvent.click(row("u2").getByTitle("Delete unit"));
    expect(confirm).toHaveBeenCalledWith('Delete unit "u2"?');
    expect(deleted).toEqual([]);
    confirm.mockReturnValue(true);
    fireEvent.click(row("u2").getByTitle("Delete unit"));
    await waitFor(() => expect(deleted).toEqual([2]));
  });

  it("a click on a unit's id shows the unit with its fields in full", async () => {
    table([unit(1, { headline: "Storm hits coast", people: ["Lena"] }, true)]);
    fireEvent.click(screen.getByTitle("Show this unit"));
    const dialog = within(await screen.findByRole("dialog"));
    expect(await dialog.findByText("Storm hits coast")).toBeTruthy();
    expect(dialog.getByText(/^Coded: replace it by uploading it again/)).toBeTruthy();
    expect(dialog.getByText("Lena")).toBeTruthy();
  });

  it("shows nothing without units", () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <UnitTable
          client={{ studyId: 1 } as ResearcherApi}
          units={[]}
          fields={FIELDS}
          groups={[]}
          cells={new Map()}
          selected={new Set()}
          onSelectedChange={() => {}}
          loading={false}
        />
      </QueryClientProvider>,
    );
    expect(container.querySelector("table")).toBeNull();
  });
});

describe("the units table's pages", () => {
  /** A pager over `total` units, 50 a page, that keeps the page shown. */
  function pager(total: number) {
    function Paged() {
      const [offset, setOffset] = useState(0);
      return <Pager offset={offset} total={total} pageSize={50} onOffsetChange={setOffset} />;
    }
    const { container } = render(<Paged />);
    const [previous, next] = screen.queryAllByRole<HTMLButtonElement>("button");
    return { previous, next, text: () => container.textContent };
  }

  it("goes forward and back, and stops at both ends", () => {
    const { previous, next, text } = pager(120);
    expect(text()).toBe("1–50 of 120");
    expect(previous.disabled).toBe(true);
    fireEvent.click(next);
    fireEvent.click(next);
    expect(text()).toBe("101–120 of 120");
    expect(next.disabled).toBe(true);
    fireEvent.click(previous);
    expect(text()).toBe("51–100 of 120");
  });

  it("is not there when the units fit one page", () => {
    expect(pager(50).text()).toBe("");
  });
});
