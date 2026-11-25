// @vitest-environment happy-dom
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AnyVariableType, Condition, Option, OptionsFrom } from "@annotinder/contracts";
import { DeployedValuesContext, EditedQuestionContext } from "../../design/deployedValues";
import { ConditionEditor } from "./ConditionEditor";
import type { TemplateEditorApi } from "./jsonEditor/TemplateCodeEditor";
import { OptionsEditor, type OptionsEditorProps } from "./OptionsEditor";
import { TemplateInsertMenu } from "./TemplateInsertMenu";

afterEach(cleanup);

const type = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } });

/** The options editor, which keeps what it changes; `options()` and `from()` are what it holds now. */
function optionsEditor(start: Option[], props: Partial<OptionsEditorProps<Option>> = {}, deployed: string[] = []) {
  let latest = start;
  let latestFrom = props.from;
  function Editor() {
    const [options, setOptions] = useState(start);
    const [from, setFrom] = useState<OptionsFrom | undefined>(props.from);
    latest = options;
    latestFrom = from;
    return (
      <DeployedValuesContext.Provider value={new Map([["topic", new Set(deployed)]])}>
        <EditedQuestionContext.Provider value="topic">
          <OptionsEditor {...props} options={options} onChange={setOptions} from={from} onFrom={setFrom} />
        </EditedQuestionContext.Provider>
      </DeployedValuesContext.Provider>
    );
  }
  render(<Editor />);
  const labels = () => screen.getAllByPlaceholderText<HTMLInputElement>(/./).filter((i) => i.placeholder !== "value");
  const values = () => screen.getAllByPlaceholderText<HTMLInputElement>("value");
  return { options: () => latest, from: () => latestFrom, labels, values };
}

describe("OptionsEditor", () => {
  it("a nominal option's value follows its label, until the value is edited by hand", () => {
    const { options, labels, values } = optionsEditor([{ value: "" }]);
    type(labels()[0], "Human interest");
    expect(options()).toEqual([{ value: "human_interest", label: "Human interest" }]);
    type(labels()[0], "Human stories");
    expect(options()[0].value).toBe("human_stories");
    type(values()[0], "hi");
    type(labels()[0], "Human");
    expect(options()).toEqual([{ value: "hi", label: "Human" }]);
  });

  it("a value in the deployed design stays when its label changes (coders may have given it)", () => {
    const { options, labels } = optionsEditor([{ value: "sports", label: "Sports" }], {}, ["sports"]);
    type(labels()[0], "Sport and games");
    expect(options()).toEqual([{ value: "sports", label: "Sport and games" }]);
  });

  it("an emptied label is no label (the saved option has none), not an empty one", () => {
    const { options, labels } = optionsEditor([{ value: "x", label: "X-rated" }]);
    type(labels()[0], "");
    expect(options()[0].label).toBeUndefined();
    expect(JSON.stringify(options())).toBe('[{"value":"x"}]');
  });

  it("adds, moves and removes options; the first can't move up, the last not down", () => {
    const { options } = optionsEditor([{ value: "a" }, { value: "b" }]);
    fireEvent.click(screen.getByText("+ Add option"));
    expect(options()).toEqual([{ value: "a" }, { value: "b" }, { value: "" }]);
    const up = () => screen.getAllByLabelText<HTMLButtonElement>("Move up");
    const down = () => screen.getAllByLabelText<HTMLButtonElement>("Move down");
    expect([up()[0].disabled, down()[2].disabled, up()[1].disabled]).toEqual([true, true, false]);
    fireEvent.click(down()[0]);
    expect(options().map((o) => o.value)).toEqual(["b", "a", ""]);
    fireEvent.click(up()[2]);
    expect(options().map((o) => o.value)).toEqual(["b", "", "a"]);
    fireEvent.click(screen.getAllByLabelText("Remove option")[1]);
    expect(options().map((o) => o.value)).toEqual(["b", "a"]);
  });

  it("no more options than the most a question takes", () => {
    optionsEditor([{ value: "a" }, { value: "b" }, { value: "c" }], { max: 3, swipe: true });
    expect(screen.queryByText("+ Add option")).toBeNull();
    expect(screen.getByLabelText("swipe left")).toBeTruthy();
    expect(screen.getByLabelText("swipe up")).toBeTruthy();
  });

  it("ordinal values are 1..n in the options' order, renumbered when options move or go", () => {
    const { options, values } = optionsEditor(
      [
        { value: 1, label: "Low" },
        { value: 2, label: "Mid" },
        { value: 3, label: "High" },
      ],
      { level: "ordinal" },
    );
    expect(values()[0].readOnly).toBe(true);
    fireEvent.click(screen.getAllByLabelText("Move down")[0]);
    expect(options().map((o) => [o.label, o.value])).toEqual([
      ["Mid", 1],
      ["Low", 2],
      ["High", 3],
    ]);
    fireEvent.click(screen.getAllByLabelText("Remove option")[0]);
    fireEvent.click(screen.getByText("+ Add option"));
    expect(options().map((o) => o.value)).toEqual([1, 2, 3]);
  });

  it("custom ordinal values are set by hand and must rise; unticking it numbers them again", () => {
    const { options, values } = optionsEditor([{ value: 0 }, { value: 5 }], { level: "ordinal" });
    // Options that aren't 1..n open as custom
    const custom = screen.getByLabelText<HTMLInputElement>("Custom values");
    expect(custom.checked).toBe(true);
    type(values()[1], "0");
    expect(options().map((o) => o.value)).toEqual([0, 0]);
    expect(screen.getByText("Ordinal values must rise in the order of the options.")).toBeTruthy();
    fireEvent.click(screen.getByText("+ Add option"));
    expect(options().map((o) => o.value)).toEqual([0, 0, 1]);
    fireEvent.click(custom);
    expect(options().map((o) => o.value)).toEqual([1, 2, 3]);
    expect(screen.queryByText("Ordinal values must rise in the order of the options.")).toBeNull();
  });

  it("options from data: a row among the options that moves, follows a removed option, and goes", () => {
    const sources = [{ from: "$unit.people", label: "people (list)" }];
    const { from } = optionsEditor([{ value: "a" }, { value: "b" }], { sources });
    type(screen.getByLabelText("Add options from data"), "$unit.people");
    // After the last option: no place is stored
    expect(from()).toEqual({ from: "$unit.people" });
    expect(screen.getByLabelText<HTMLButtonElement>("Move options from data down").disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Move options from data up"));
    fireEvent.click(screen.getByLabelText("Move options from data up"));
    expect(from()).toEqual({ from: "$unit.people", at: 0 });
    expect(screen.getByLabelText<HTMLButtonElement>("Move options from data up").disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Move options from data down"));
    expect(from()).toEqual({ from: "$unit.people", at: 1 });
    // The option before it goes: it stays between the same options
    fireEvent.click(screen.getAllByLabelText("Remove option")[0]);
    expect(from()).toEqual({ from: "$unit.people", at: 0 });
    fireEvent.click(screen.getByLabelText("Remove options from data"));
    expect(from()).toBeUndefined();
    expect(screen.getByLabelText("Add options from data")).toBeTruthy();
  });
});

const QUESTIONS: { name: string; variable: AnyVariableType }[] = [
  {
    name: "role",
    variable: { type: "nominal", question: "?", options: [{ value: "student" }, { value: "expert", label: "Expert" }] },
  },
  { name: "age", variable: { type: "numeric", question: "?", min: 0, max: 120 } },
  {
    name: "topics",
    variable: { type: "nominal", question: "?", multiple: true, options: [{ value: "sports" }, { value: "news" }] },
  },
] as { name: string; variable: AnyVariableType }[];

/** The condition editor, which keeps what it changes; `script()` is the condition now. */
function conditionEditor(start: string) {
  let latest = start;
  function Editor() {
    const [condition, setCondition] = useState<Condition>({ script: start });
    latest = condition.script;
    return <ConditionEditor condition={condition} onChange={setCondition} questions={QUESTIONS} />;
  }
  render(<Editor />);
  const selects = () => screen.getAllByRole<HTMLSelectElement>("combobox");
  return { script: () => latest, selects };
}

describe("the rules of a condition", () => {
  it("a new rule is the first question, its first operator and value", () => {
    const { script } = conditionEditor("");
    fireEvent.click(screen.getByText("Rule"));
    expect(script()).toBe('$var.role.is("student")');
  });

  it("another question starts the rule again; another value keeps the rest", () => {
    const { script, selects } = conditionEditor('$var.role.is("student")');
    type(selects()[2], JSON.stringify("expert"));
    expect(script()).toBe('$var.role.is("expert")');
    type(selects()[0], "age");
    expect(script()).not.toContain("role");
    expect(script()).toContain("$var.age.");
  });

  it("an operator that takes several values keeps the one chosen, as toggles", () => {
    const { script, selects } = conditionEditor('$var.role.is("expert")');
    type(selects()[1], "isAny");
    expect(script()).toBe('$var.role.isAny("expert")');
    fireEvent.click(screen.getByText("student"));
    expect(script()).toBe('$var.role.isAny("expert", "student")');
    fireEvent.click(screen.getByText("Expert"));
    expect(script()).toBe('$var.role.isAny("student")');
  });

  it("an operator without values drops them", () => {
    const { script, selects } = conditionEditor('$var.role.is("expert")');
    type(selects()[1], "answered");
    expect(script()).toBe("$var.role.answered");
    expect(selects()).toHaveLength(2);
  });

  it("a number, and a count: typed in a box (emptied: 0)", () => {
    const { script } = conditionEditor("$var.topics.count() >= 2");
    const box = screen.getByRole<HTMLInputElement>("spinbutton");
    expect(box.value).toBe("2");
    type(box, "1");
    expect(script()).toBe("$var.topics.count() >= 1");
    type(screen.getByRole("spinbutton"), "");
    expect(script()).toBe("$var.topics.count() >= 0");
  });

  it("a value that is no option of the question shows as such, and says what is wrong", () => {
    const { selects } = conditionEditor('$var.role.is("teacher")');
    expect(selects()[2].selectedOptions[0].textContent).toBe('"teacher" (not an option)');
    expect(selects()[2].className).toContain("border-destructive");
    expect(document.querySelector("p.text-destructive")).toBeTruthy();
  });

  it("a question that is gone stays as its rule, marked; choosing another fixes it", () => {
    const { script, selects } = conditionEditor('$var.removed.is("x")');
    expect(selects()[0].selectedOptions[0].textContent).toBe("removed (not available)");
    type(selects()[0], "role");
    expect(script()).toBe('$var.role.is("student")');
  });

  it("rules are joined by and, or by or; a removed rule is gone from the script", () => {
    const { script, selects } = conditionEditor('$var.role.is("expert") && $var.age.gte(18)');
    type(selects()[0], "any");
    expect(script()).toBe('$var.role.is("expert") || $var.age.gte(18)');
    fireEvent.click(screen.getAllByLabelText("Remove rule")[0]);
    expect(script()).toBe("$var.age.gte(18)");
  });
});

/** The Insert menu over an editor that records what is inserted. */
function insertMenu(more: { fields?: string[]; snippets?: string[]; loopQuestions?: string[] } = {}) {
  const inserted: string[] = [];
  const editor = { insertSnippet: (snippet: string) => inserted.push(snippet) } as unknown as TemplateEditorApi;
  render(
    <div>
      <p>Outside</p>
      <TemplateInsertMenu
        editor={editor}
        fields={more.fields ?? ["title", "text"]}
        loopQuestions={more.loopQuestions ?? ["topic"]}
        questions={[]}
        snippets={more.snippets ?? []}
      />
    </div>,
  );
  const open = (section: string) => {
    fireEvent.click(screen.getByText("Insert"));
    fireEvent.click(screen.getByText(section));
  };
  return { inserted, open };
}

describe("the Insert menu of a layout's template", () => {
  it("a unit field as a headline, as text or as an image", () => {
    const { inserted, open } = insertMenu();
    open("Headline");
    expect(screen.getByText("Which field?")).toBeTruthy();
    fireEvent.click(screen.getByText("title"));
    open("Text");
    fireEvent.click(screen.getByText("text"));
    open("Image");
    fireEvent.click(screen.getByText("title"));
    expect(inserted).toEqual(["# \\$unit.title\n$0", "\\$unit.text\n$0", "\\$unit.title::image\n$0"]);
    // Inserting closes the menu
    expect(screen.queryByText("Which field?")).toBeNull();
  });

  it("blocks wrap the selected text: from a question on, a style, HTML", () => {
    const { inserted, open } = insertMenu();
    open("Show from…");
    fireEvent.click(screen.getByText("topic"));
    open("Style…");
    fireEvent.click(screen.getByText("Centered"));
    open("HTML block");
    expect(inserted).toEqual([
      "::: from topic\n${TM_SELECTED_TEXT}$0\n:::",
      "::: style text-align: center\n${TM_SELECTED_TEXT}$0\n:::",
      "::: html\n${TM_SELECTED_TEXT}$0\n:::",
    ]);
  });

  it("a snippet by its name; without any, it says where they are made", () => {
    const none = insertMenu();
    none.open("Snippet");
    expect(screen.getByText("This loop has no snippets yet: add them below the template.")).toBeTruthy();
    cleanup();
    const { inserted, open } = insertMenu({ snippets: ["note"] });
    open("Snippet");
    fireEvent.click(screen.getByText("note"));
    expect(inserted).toEqual(["[[note]]\n$0"]);
  });

  it("says so when the units have no fields, or the loop no questions", () => {
    const { open } = insertMenu({ fields: [], loopQuestions: [] });
    open("Headline");
    expect(screen.getByText("This study's units have no fields yet: upload units first.")).toBeTruthy();
    fireEvent.click(screen.getByTitle("Back"));
    fireEvent.click(screen.getByText("Show from…"));
    expect(screen.getByText("This loop has no questions yet.")).toBeTruthy();
  });

  it("closes on a press outside it, and on its own button", () => {
    insertMenu();
    fireEvent.click(screen.getByText("Insert"));
    expect(screen.getByText("Headline")).toBeTruthy();
    fireEvent.pointerDown(screen.getByText("Headline"));
    expect(screen.getByText("Headline")).toBeTruthy();
    fireEvent.pointerDown(screen.getByText("Outside"));
    expect(screen.queryByText("Headline")).toBeNull();
    fireEvent.click(screen.getByText("Insert"));
    fireEvent.click(screen.getByText("Insert"));
    expect(screen.queryByText("Headline")).toBeNull();
  });

  it('"Show if…" asks for a condition in a dialog, and inserts its block', () => {
    const { inserted, open } = insertMenu();
    open("Show if…");
    const insert = screen.getByText<HTMLButtonElement>("Insert", { selector: "[role=dialog] button" });
    expect(insert.disabled).toBe(true);
    fireEvent.click(screen.getByText("Script"));
    type(screen.getByRole("textbox"), " $unit.long ");
    fireEvent.click(screen.getByText("Insert", { selector: "[role=dialog] button" }));
    expect(inserted).toEqual(["::: if \\$unit.long\n${TM_SELECTED_TEXT}$0\n:::"]);
  });

  it("can't be opened without an editor", () => {
    render(<TemplateInsertMenu editor={null} fields={[]} loopQuestions={[]} questions={[]} snippets={[]} />);
    expect(screen.getByText<HTMLButtonElement>("Insert").disabled).toBe(true);
  });
});
