import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { toXlsx } from "./xlsx";

describe("toXlsx", () => {
  const files = unzipSync(
    toXlsx([
      { name: "annotations", table: { headers: ["id", "text", "n"], rows: [["007", "=SUM(A1) & <b>", "12.5"]] } },
      { name: "annotations", table: { headers: ["x"], rows: [] } },
    ]),
  );

  it("is a workbook with a sheet per table, uniquely named", () => {
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        "[Content_Types].xml",
        "xl/workbook.xml",
        "xl/worksheets/sheet1.xml",
        "xl/worksheets/sheet2.xml",
      ]),
    );
    const workbook = strFromU8(files["xl/workbook.xml"]);
    expect(workbook).toContain('name="annotations"');
    expect(workbook).toContain('name="annotations_2"');
  });

  it("writes text as inline strings (never formulas), escaped; plain numbers as numbers; ids with leading zeros as text", () => {
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain(
      '<c r="B2" t="inlineStr"><is><t xml:space="preserve">=SUM(A1) &amp; &lt;b&gt;</t></is></c>',
    );
    expect(sheet).toContain('<c r="C2"><v>12.5</v></c>');
    expect(sheet).toContain('<c r="A2" t="inlineStr"><is><t xml:space="preserve">007</t></is></c>');
    expect(sheet).not.toContain("<f>");
  });

  it("writes a cell with an exponent as text: 1e5 is what a coder typed, not 100000", () => {
    const sheet = strFromU8(
      unzipSync(toXlsx([{ name: "t", table: { headers: ["a", "b"], rows: [["1e5", "-2E+3"]] } }]))[
        "xl/worksheets/sheet1.xml"
      ],
    );
    expect(sheet).toContain('<c r="A2" t="inlineStr"><is><t xml:space="preserve">1e5</t></is></c>');
    expect(sheet).toContain('<c r="B2" t="inlineStr"><is><t xml:space="preserve">-2E+3</t></is></c>');
  });

  /** The first sheet of a workbook with one table. */
  const sheetOf = (headers: string[], ...rows: string[][]) =>
    strFromU8(unzipSync(toXlsx([{ name: "t", table: { headers, rows } }]))["xl/worksheets/sheet1.xml"]);
  const textOf = (sheet: string, cell: string) =>
    new RegExp(`<c r="${cell}" t="inlineStr"><is><t xml:space="preserve">([^<]*)</t>`).exec(sheet)?.[1];

  it("cuts a cell over Excel's 32,767 characters, ending it with …", () => {
    const sheet = sheetOf(["fits", "long"], ["a".repeat(32767), "b".repeat(32768)]);
    expect(textOf(sheet, "A2")).toBe("a".repeat(32767));
    expect(textOf(sheet, "B2")).toBe("b".repeat(32766) + "…");
  });

  it("leaves out the control characters XML can't hold, keeps tabs and line breaks", () => {
    const sheet = sheetOf(["text"], ["bell\u0007 null\u0000 escape\u001B tab\t line\nbreak\r"]);
    expect(textOf(sheet, "A2")).toBe("bell null escape tab\t line\nbreak\r");
  });

  it("writes a number of more than 15 digits as text (a spreadsheet would round it), and a header never as a number", () => {
    const sheet = sheetOf(["2024"], ["123456789012345", "1234567890123456"]);
    expect(textOf(sheet, "A1")).toBe("2024");
    expect(sheet).toContain('<c r="A2"><v>123456789012345</v></c>');
    expect(textOf(sheet, "B2")).toBe("1234567890123456");
  });

  it("writes no cell for an empty value, and names columns beyond Z", () => {
    const row = Array.from({ length: 28 }, (_, i) => (i === 1 ? "" : "x"));
    const sheet = sheetOf(row, row);
    expect(sheet).not.toContain('r="B2"');
    expect(sheet).toContain('r="Z2"');
    expect(sheet).toContain('r="AA2"');
    expect(sheet).toContain('r="AB2"');
  });

  it("names sheets as Excel takes them: 31 characters, without \\ / ? * [ ] :, unique whatever the case", () => {
    const names = ["a/b:c", "A/B:C", "x".repeat(40), "x".repeat(40), ""];
    const files = unzipSync(toXlsx(names.map((name) => ({ name, table: { headers: ["h"], rows: [] } }))));
    const sheets = [...strFromU8(files["xl/workbook.xml"]).matchAll(/<sheet name="([^"]*)"/g)].map((m) => m[1]);
    expect(sheets).toEqual(["a_b_c", "A_B_C_2", "x".repeat(31), `${"x".repeat(28)}_2`, "Sheet"]);
  });
});
