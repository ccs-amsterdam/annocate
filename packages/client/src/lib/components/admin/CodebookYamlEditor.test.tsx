import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CodebookYamlEditor,
  getFoldableLineNumbers,
  addBlankLinesBetweenCodebookItems,
  formatCodebookYaml,
} from "./CodebookYamlEditor";
import type { TopLevelItem } from "@annotinder/contracts";

describe("CodebookYamlEditor", () => {
  const dummyItems: TopLevelItem[] = [
    {
      type: "user_variable",
      name: "consent",
      variable: { type: "confirm", question: "Do you agree?" },
    },
  ];

  it("renders without throwing and displays controls", () => {
    const onChange = vi.fn();
    const html = renderToStaticMarkup(
      <CodebookYamlEditor items={dummyItems} onChange={onChange} />,
    );
    expect(html).toContain("Valid Codebook Schema");
    expect(html).toContain("Fold Details");
    expect(html).toContain("Unfold All");
    expect(html).toContain("Format YAML");
  });

  describe("addBlankLinesBetweenCodebookItems", () => {
    it("inserts an empty line before every codebook item including nested children, but not codes", () => {
      const input = [
        "- name: item1",
        "  type: user_variable",
        "- name: item2",
        "  type: unit_loop",
        "  children:",
        "    - name: child1",
        "      type: unit_variable",
        "      variable:",
        "        type: select_code",
        "        codes:",
        "          - code: pos",
        "          - code: neg",
        "    - name: child2",
        "      type: unit_variable",
        "- name: item3",
        "  type: user_variable",
      ].join("\n");

      const output = addBlankLinesBetweenCodebookItems(input);
      expect(output).toBe([
        "- name: item1",
        "  type: user_variable",
        "",
        "- name: item2",
        "  type: unit_loop",
        "  children:",
        "",
        "    - name: child1",
        "      type: unit_variable",
        "      variable:",
        "        type: select_code",
        "        codes:",
        "          - code: pos",
        "          - code: neg",
        "",
        "    - name: child2",
        "      type: unit_variable",
        "",
        "- name: item3",
        "  type: user_variable",
      ].join("\n"));
    });

    it("does not insert duplicate empty lines if one already exists", () => {
      const input = "- name: a\n\n- name: b";
      expect(addBlankLinesBetweenCodebookItems(input)).toBe("- name: a\n\n- name: b");
    });
  });

  describe("formatCodebookYaml", () => {
    it("formats array of items with 2 space indent and blank lines between codebook items", () => {
      const items: TopLevelItem[] = [
        {
          name: "consent",
          type: "user_variable",
          variable: { type: "confirm", question: "Agree?" },
        },
        {
          name: "main",
          type: "unit_loop",
          unitset: "main",
          layout: { template: "# {{ $unit.text }}" },
          children: [
            {
              name: "q1",
              type: "unit_variable",
              variable: {
                type: "select_code",
                question: "Sentiment?",
                codes: [{ code: "pos" }, { code: "neg" }],
              },
            },
            {
              name: "q2",
              type: "unit_variable",
              variable: {
                type: "select_code",
                question: "Topic?",
                codes: [{ code: "news" }, { code: "sports" }],
              },
            },
          ],
        },
      ];

      const yaml = formatCodebookYaml(items);
      expect(yaml).toContain("- name: consent\n  type: user_variable");
      expect(yaml).toContain("\n\n- name: main\n  type: unit_loop");
      expect(yaml).toContain("children:\n\n    - name: q1");
      expect(yaml).toContain("\n\n    - name: q2");
      // Codes sub-list should remain compact without blank lines
      expect(yaml).toContain("codes:\n          - code: pos\n          - code: neg");
    });
  });

  describe("getFoldableLineNumbers", () => {
    it("identifies 1-based variable and layout lines that have indented children", () => {
      const sampleYaml = [
        "- name: consent", // line 1
        "  type: user_variable", // line 2
        "  variable:", // line 3 -> matches
        "    type: confirm", // line 4
        "    question: Agree?", // line 5
        "", // line 6
        "- name: main_loop", // line 7
        "  type: unit_loop", // line 8
        "  unitset: main", // line 9
        "  layout:", // line 10 -> matches
        "    template: text", // line 11
        "  children:", // line 12
        "", // line 13
        "    - name: sentiment", // line 14
        "      type: unit_variable", // line 15
        "      variable:", // line 16 -> matches
        "        type: select_code", // line 17
      ].join("\n");

      const lineNumbers = getFoldableLineNumbers(sampleYaml);
      expect(lineNumbers).toEqual([3, 10, 16]);
    });

    it("ignores empty or inline variable declarations", () => {
      const sampleYaml = [
        "- name: test",
        "  variable_name: foo",
        "  variable: {}",
      ].join("\n");

      const lineNumbers = getFoldableLineNumbers(sampleYaml);
      expect(lineNumbers).toEqual([]);
    });
  });
});
