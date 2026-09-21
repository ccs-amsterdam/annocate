import type { CSSProperties } from "react";

// Common standard HTML color names for fallback in non-browser environments (e.g. Node / Vitest)
const NAMED_COLORS: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  orange: "#ffa500",
  purple: "#800080",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  navy: "#000080",
  teal: "#008080",
  aqua: "#00ffff",
  cyan: "#00ffff",
  lime: "#00ff00",
  maroon: "#800000",
  olive: "#808000",
  fuchsia: "#ff00ff",
  magenta: "#ff00ff",
  pink: "#ffc0cb",
  gold: "#ffd700",
  coral: "#ff7f50",
  tomato: "#ff6347",
  salmon: "#fa8072",
  khaki: "#f0e68c",
  plum: "#dda0dd",
  indigo: "#4b0082",
  violet: "#ee82ee",
  turquoise: "#40e0d0",
  skyblue: "#87ceeb",
  crimson: "#dc143c",
};

/**
 * Converts an rgba string e.g. "rgba(255, 0, 0, 0.5)" to 6-digit hex "#ff0000".
 */
function rgbaToHex(rgba: string): string {
  const parts = rgba
    .replace(/^rgba?\(-|\s+|\)$/g, "")
    .split(",")
    .map((s) => parseFloat(s));
  if (parts.length >= 3) {
    const r = Math.round(parts[0]).toString(16).padStart(2, "0");
    const g = Math.round(parts[1]).toString(16).padStart(2, "0");
    const b = Math.round(parts[2]).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  }
  return rgba;
}

/**
 * Checks whether the environment currently has dark mode active via Tailwind's `dark` class.
 */
export function isDarkMode(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

/**
 * Normalizes any CSS color (hex, rgb, hsl, named color) into standard 6-digit hex (#rrggbb),
 * and optionally appends an alpha channel hex string (e.g. "35" for ~21% opacity, "50" for ~31%).
 */
export function standardizeColor(colorStr?: string, alphaHex?: string): string | undefined {
  if (!colorStr) return undefined;
  const trimmed = colorStr.trim();
  if (trimmed.startsWith("var(--")) return trimmed; // CSS variable

  let hex: string | undefined;

  // 1. Browser canvas normalization if available
  if (typeof document !== "undefined") {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = trimmed;
        let computed = ctx.fillStyle;
        if (computed.startsWith("rgba(") || computed.startsWith("rgb(")) {
          computed = rgbaToHex(computed);
        }
        if (computed.startsWith("#")) {
          hex = computed;
        }
      }
    } catch {
      // Fallback below
    }
  }

  // 2. Fallback normalization (for SSR, Node, or Vitest)
  if (!hex) {
    const lower = trimmed.toLowerCase();
    if (NAMED_COLORS[lower]) {
      hex = NAMED_COLORS[lower];
    } else if (lower.startsWith("#")) {
      const raw = lower.slice(1);
      if (raw.length === 3) {
        hex = `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
      } else if (raw.length === 4) {
        hex = `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
      } else if (raw.length >= 6) {
        hex = `#${raw.slice(0, 6)}`;
      }
    } else if (lower.startsWith("rgb")) {
      hex = rgbaToHex(lower);
    }
  }

  if (!hex || !hex.startsWith("#")) return trimmed;

  // Ensure standard 7-char `#rrggbb`
  if (hex.length > 7) hex = hex.slice(0, 7);

  if (alphaHex) {
    const cleanAlpha = alphaHex.replace(/^#/, "");
    return `${hex}${cleanAlpha}`;
  }

  return hex;
}

/**
 * Calculates whether white or black text provides better contrast for a given hex color.
 */
export function getContrastTextColor(hexColor?: string): string {
  if (!hexColor || !hexColor.startsWith("#") || hexColor.length < 7) return "#111827";
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  // Standard relative luminance formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#111827" : "#ffffff";
}

/**
 * Generates styling for selectable code buttons:
 * - Unselected: vivid background tint with alpha, vivid border, high-contrast text
 *   (white in dark mode, crisp dark in light mode).
 * - Selected: vivid solid background with high-contrast text.
 */
export function getCodeButtonStyle(
  color?: string,
  selected = false,
  isDark?: boolean,
): CSSProperties | undefined {
  if (!color) return undefined;
  const dark = isDark ?? isDarkMode();
  const baseHex = standardizeColor(color);
  if (!baseHex || !baseHex.startsWith("#")) {
    return selected
      ? { backgroundColor: color, borderColor: color, color: "#ffffff" }
      : { backgroundColor: "transparent", borderColor: color, color: dark ? "#ffffff" : "#111827" };
  }

  if (selected) {
    return {
      backgroundColor: baseHex,
      borderColor: baseHex,
      color: getContrastTextColor(baseHex),
      boxShadow: `0 0 0 1px ${baseHex}`,
    };
  }

  return {
    backgroundColor: dark ? `${baseHex}38` : `${baseHex}28`, // ~22% in dark, ~16% in light
    borderColor: dark ? `${baseHex}aa` : `${baseHex}88`,
    color: dark ? "#ffffff" : "#111827", // White in dark mode for maximum legibility
  };
}

export interface SpanSegmentStyleOptions {
  color?: string;
  isStart?: boolean;
  isEnd?: boolean;
}

/**
 * Generates styling for highlighted text spans (`<mark>`):
 * Uses a gentle ~22% alpha background so text remains 100% crisp and readable,
 * with solid top and bottom boundary borders (crisp upper ceiling and bottom ribbon),
 * plus solid boundary endcaps (thick left/right border and rounded corners at start/end).
 */
export function getSpanHighlightStyle(options?: SpanSegmentStyleOptions | string): CSSProperties {
  const opts = typeof options === "string" ? { color: options } : (options ?? {});
  const fallback = "#fde68a"; // warm yellow
  const baseHex = standardizeColor(opts.color ?? fallback) ?? fallback;

  return {
    backgroundColor: `${baseHex}38`, // ~22% opacity highlight
    borderTop: `2px solid ${baseHex}`,
    borderBottom: `2.5px solid ${baseHex}`,
    borderLeft: opts.isStart ? `3px solid ${baseHex}` : "none",
    borderRight: opts.isEnd ? `3px solid ${baseHex}` : "none",
    borderTopLeftRadius: opts.isStart ? "4px" : "0px",
    borderBottomLeftRadius: opts.isStart ? "4px" : "0px",
    borderTopRightRadius: opts.isEnd ? "4px" : "0px",
    borderBottomRightRadius: opts.isEnd ? "4px" : "0px",
    paddingLeft: opts.isStart ? "3px" : "1px",
    paddingRight: opts.isEnd ? "3px" : "1px",
    paddingTop: "1px",
    paddingBottom: "1px",
    marginLeft: opts.isStart ? "1.5px" : "0px",
    marginRight: opts.isEnd ? "1.5px" : "0px",
    color: "inherit",
    cursor: "pointer",
    borderRadius: opts.isStart && opts.isEnd ? "4px" : undefined,
    display: "inline",
    boxDecorationBreak: "clone",
    WebkitBoxDecorationBreak: "clone",
  };
}

export interface StackedSegmentSpan {
  color?: string;
  isStart?: boolean;
  isEnd?: boolean;
}

/**
 * Generates styling for an overlapping segment covered by 2 or more spans.
 * Produces multi-colored gradient ribbons along top and bottom borders,
 * matching the exact vertical height and alignment of single spans (3px top, 3.5px bottom)
 * without overlapping adjacent text lines.
 */
export function getStackedUnderlineStyle(spans: StackedSegmentSpan[]): CSSProperties {
  const valid = spans.map((s) => ({
    color: standardizeColor(s.color ?? "#fde68a") ?? "#fde68a",
    isStart: s.isStart,
    isEnd: s.isEnd,
  }));

  if (valid.length === 0) return getSpanHighlightStyle();
  if (valid.length === 1) {
    return getSpanHighlightStyle({
      color: valid[0].color,
      isStart: valid[0].isStart,
      isEnd: valid[0].isEnd,
    });
  }

  const n = valid.length;
  // Multi-color horizontal segments for top and bottom border ribbons
  const borderStops = valid
    .map((s, idx) => `${s.color} ${((idx / n) * 100).toFixed(1)}%, ${s.color} ${(((idx + 1) / n) * 100).toFixed(1)}%`)
    .join(", ");

  // Multi-color subtle horizontal bands for background tint
  const bgStops = valid
    .map((s, idx) => `${s.color}38 ${((idx / n) * 100).toFixed(1)}%, ${s.color}38 ${(((idx + 1) / n) * 100).toFixed(1)}%`)
    .join(", ");

  const anyStart = valid.some((s) => s.isStart);
  const anyEnd = valid.some((s) => s.isEnd);

  // Left and right boundary colors (from the starting / ending span)
  const startSpans = valid.filter((s) => s.isStart);
  const startColor = startSpans.length > 0 ? startSpans[0].color : valid[0].color;
  const endSpans = valid.filter((s) => s.isEnd);
  const endColor = endSpans.length > 0 ? endSpans[endSpans.length - 1].color : valid[valid.length - 1].color;

  return {
    background: `linear-gradient(to right, ${borderStops}) top / 100% 2px no-repeat, linear-gradient(to right, ${borderStops}) bottom / 100% 2.5px no-repeat, linear-gradient(to bottom, ${bgStops})`,
    borderLeft: anyStart ? `3px solid ${startColor}` : "none",
    borderRight: anyEnd ? `3px solid ${endColor}` : "none",
    borderTopLeftRadius: anyStart ? "4px" : "0px",
    borderBottomLeftRadius: anyStart ? "4px" : "0px",
    borderTopRightRadius: anyEnd ? "4px" : "0px",
    borderBottomRightRadius: anyEnd ? "4px" : "0px",
    paddingLeft: anyStart ? "3px" : "1px",
    paddingRight: anyEnd ? "3px" : "1px",
    paddingTop: "3px", // 1px padding + 2px top ribbon to match single span height
    paddingBottom: "3.5px", // 1px padding + 2.5px bottom ribbon to match single span height
    marginLeft: anyStart ? "1.5px" : "0px",
    marginRight: anyEnd ? "1.5px" : "0px",
    color: "inherit",
    cursor: "pointer",
    borderRadius: anyStart && anyEnd ? "4px" : undefined,
    display: "inline",
    boxDecorationBreak: "clone",
    WebkitBoxDecorationBreak: "clone",
  };
}

/**
 * Backwards-compatible helper for multi-span styles.
 */
export function getMultiSpanHighlightStyle(colors: (string | undefined)[]): CSSProperties {
  return getStackedUnderlineStyle(colors.map((c) => ({ color: c })));
}

/**
 * Generates styling for a compact tag / badge representing a code.
 * White text in dark mode for maximum legibility.
 */
export function getCodeBadgeStyle(color?: string, isDark?: boolean): CSSProperties {
  const dark = isDark ?? isDarkMode();
  const baseHex = standardizeColor(color ?? "#6b7280") ?? "#6b7280";
  return {
    backgroundColor: dark ? `${baseHex}38` : `${baseHex}28`,
    borderColor: dark ? `${baseHex}aa` : `${baseHex}88`,
    color: dark ? "#ffffff" : "#111827",
  };
}
