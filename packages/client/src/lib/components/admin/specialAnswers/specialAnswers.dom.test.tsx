// @vitest-environment happy-dom
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SpecialAnswer } from "@annotinder/contracts";
import { OptionsEditor } from "../OptionsEditor";
import { SpecialAnswersFields } from "../variableType/SpecialAnswersFields";

afterEach(cleanup);

/** Renders `Editor` with state of its own; `specials()` is what it holds now. */
function withSpecials(
  Editor: (p: { specials?: SpecialAnswer[]; set: (s?: SpecialAnswer[]) => void }) => React.ReactNode,
) {
  let latest: SpecialAnswer[] | undefined;
  function Host() {
    const [specials, setSpecials] = useState<SpecialAnswer[] | undefined>();
    latest = specials;
    return <Editor specials={specials} set={setSpecials} />;
  }
  render(<Host />);
  return { specials: () => latest };
}

const NAMES = { dont_know: "Don't know", not_applicable: "Not applicable" } as const;

/** "+ Add special option", then (both kinds left) the kind in its menu. */
const add = (kind: keyof typeof NAMES) => {
  fireEvent.click(screen.getByRole("button", { name: "+ Add special option" }));
  const item = screen.queryByRole("button", { name: new RegExp(`^${NAMES[kind]}`) });
  if (item) fireEvent.click(item);
};
const menu = () => screen.getAllByRole("button", { name: /^(Don't know|Not applicable)/ }).map((b) => b.textContent);

describe("special answers", () => {
  it("show nothing until one is added; the menu holds the kinds not yet added", () => {
    const held = withSpecials(({ specials, set }) => <SpecialAnswersFields specials={specials} onChange={set} />);
    expect(screen.queryByLabelText("Label of Don't know")).toBeNull();
    // Both kinds left: a menu, don't know first
    fireEvent.click(screen.getByRole("button", { name: "+ Add special option" }));
    expect(menu()).toEqual(["Don't know/8", "Not applicable/9"]);
    fireEvent.click(screen.getByRole("button", { name: /^Don't know/ }));
    expect(held.specials()).toEqual([{ kind: "dont_know" }]);
    // One left: the button adds it
    fireEvent.click(screen.getByRole("button", { name: "+ Add special option" }));
    expect(held.specials()).toEqual([{ kind: "dont_know" }, { kind: "not_applicable" }]);
    expect(screen.queryByRole("button", { name: "+ Add special option" })).toBeNull();
  });

  it("have a label and a code, left out when empty, and go away with their remove button", () => {
    const held = withSpecials(({ specials, set }) => <SpecialAnswersFields specials={specials} onChange={set} />);
    add("dont_know");
    fireEvent.change(screen.getByLabelText("Label of Don't know"), { target: { value: "Can't tell" } });
    fireEvent.change(screen.getByLabelText("Code of Don't know"), { target: { value: "99" } });
    expect(held.specials()).toEqual([{ kind: "dont_know", label: "Can't tell", value: 99 }]);
    fireEvent.change(screen.getByLabelText("Label of Don't know"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Code of Don't know"), { target: { value: "" } });
    expect(held.specials()).toEqual([{ kind: "dont_know" }]);
    fireEvent.click(screen.getByLabelText("Remove Don't know"));
    expect(held.specials()).toBeUndefined();
    expect(screen.queryByLabelText("Label of Don't know")).toBeNull();
  });

  it("sit under the options of an options editor, with text codes for nominal questions", () => {
    const held = withSpecials(({ specials, set }) => (
      <OptionsEditor options={[{ value: "a" }]} onChange={() => {}} specials={specials} onSpecials={set} specialsText />
    ));
    add("not_applicable");
    fireEvent.change(screen.getByLabelText("Code of Not applicable"), { target: { value: "na" } });
    expect(held.specials()).toEqual([{ kind: "not_applicable", value: "na" }]);
    fireEvent.click(screen.getByLabelText("Remove Not applicable"));
    expect(held.specials()).toBeUndefined();
  });
});
