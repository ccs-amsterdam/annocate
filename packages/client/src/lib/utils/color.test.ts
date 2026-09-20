import { describe, expect, it } from "vitest";
import {
  standardizeColor,
  getCodeButtonStyle,
  getCodeBadgeStyle,
  getSpanHighlightStyle,
  getStackedUnderlineStyle,
  getContrastTextColor,
} from "./color";

describe("color standardization", () => {
  it("normalizes hex colors and appends alpha channel", () => {
    expect(standardizeColor("#f00")).toBe("#ff0000");
    expect(standardizeColor("#ff0000", "50")).toBe("#ff000050");
    expect(standardizeColor("#4caf50", "28")).toBe("#4caf5028");
  });

  it("normalizes named CSS colors", () => {
    expect(standardizeColor("green")).toBe("#008000");
    expect(standardizeColor("green", "35")).toBe("#00800035");
    expect(standardizeColor("tomato", "50")).toBe("#ff634750");
  });

  it("leaves CSS variables intact", () => {
    expect(standardizeColor("var(--primary)")).toBe("var(--primary)");
  });

  it("produces readable unselected code button styles with background tint and dark text", () => {
    const style = getCodeButtonStyle("#2196f3", false);
    expect(style).toBeDefined();
    expect(style?.backgroundColor).toBe("#2196f328");
    expect(style?.borderColor).toBe("#2196f388");
    expect(style?.color).toBe("#111827");
  });

  it("produces crisp white text for unselected buttons and badges in dark mode", () => {
    const darkBtn = getCodeButtonStyle("#2196f3", false, true);
    expect(darkBtn?.color).toBe("#ffffff");
    expect(darkBtn?.backgroundColor).toBe("#2196f338");
    expect(darkBtn?.borderColor).toBe("#2196f3aa");

    const darkBadge = getCodeBadgeStyle("#2196f3", true);
    expect(darkBadge.color).toBe("#ffffff");
    expect(darkBadge.backgroundColor).toBe("#2196f338");
  });

  it("produces high-contrast selected button styles", () => {
    const darkStyle = getCodeButtonStyle("#2196f3", true);
    expect(darkStyle?.backgroundColor).toBe("#2196f3");
    expect(darkStyle?.color).toBe("#ffffff");

    const lightStyle = getCodeButtonStyle("#ffff00", true);
    expect(lightStyle?.backgroundColor).toBe("#ffff00");
    expect(lightStyle?.color).toBe("#111827");
  });

  it("produces span highlight styles with upper border and bottom ribbon", () => {
    const spanStyle = getSpanHighlightStyle("#f44336");
    expect(spanStyle.backgroundColor).toBe("#f4433638");
    expect(spanStyle.borderTop).toContain("#f44336");
    expect(spanStyle.borderBottom).toContain("#f44336");
    expect(spanStyle.color).toBe("inherit");
  });

  it("produces distinct start and end endcap borders", () => {
    const startStyle = getSpanHighlightStyle({ color: "#2196f3", isStart: true, isEnd: false });
    expect(startStyle.borderLeft).toContain("#2196f3");
    expect(startStyle.borderRight).toBe("none");

    const endStyle = getSpanHighlightStyle({ color: "#2196f3", isStart: false, isEnd: true });
    expect(endStyle.borderLeft).toBe("none");
    expect(endStyle.borderRight).toContain("#2196f3");
  });

  it("produces multi-colored gradient ribbons for overlapping spans without line overlap", () => {
    const multiStyle = getStackedUnderlineStyle([
      { color: "#2196f3", isStart: true, isEnd: false },
      { color: "#4caf50", isStart: false, isEnd: true },
    ]);
    expect(multiStyle.background).toContain("#2196f3");
    expect(multiStyle.background).toContain("#4caf50");
    expect(multiStyle.borderLeft).toContain("#2196f3");
    expect(multiStyle.borderRight).toContain("#4caf50");
  });

  it("calculates contrast text color correctly", () => {
    expect(getContrastTextColor("#000000")).toBe("#ffffff");
    expect(getContrastTextColor("#ffffff")).toBe("#111827");
    expect(getContrastTextColor("#ffeb3b")).toBe("#111827"); // yellow
    expect(getContrastTextColor("#1a237e")).toBe("#ffffff"); // dark blue
  });
});
