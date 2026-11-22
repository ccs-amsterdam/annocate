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
});
