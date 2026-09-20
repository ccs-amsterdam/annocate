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
    .replace(/^rgba?\(|\s+|\)$/g, "")
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
 * - Unselected: vivid background tint with alpha, vivid border, crisp black/dark text.
 * - Selected: vivid solid background with high-contrast text.
 */
export function getCodeButtonStyle(color?: string, selected = false): CSSProperties | undefined {
  if (!color) return undefined;
  const baseHex = standardizeColor(color);
  if (!baseHex || !baseHex.startsWith("#")) {
    return selected
      ? { backgroundColor: color, borderColor: color, color: "#ffffff" }
      : { backgroundColor: "transparent", borderColor: color, color: "#111827" };
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
    backgroundColor: `${baseHex}28`, // ~16% opacity vivid tint
    borderColor: `${baseHex}88`, // ~53% opacity border
    color: "#111827", // Always crisp dark text for high legibility
  };
}

/**
 * Generates styling for highlighted text spans (`<mark>`):
 * Uses a gentle ~22% alpha background so text remains 100% crisp and readable,
 * with a subtle bottom border for extra distinction.
 */
export function getSpanHighlightStyle(color?: string): CSSProperties {
  const fallback = "#fde68a"; // warm yellow
  const baseHex = standardizeColor(color ?? fallback) ?? fallback;
  return {
    backgroundColor: `${baseHex}38`, // ~22% opacity highlight
    borderBottom: `2px solid ${baseHex}`,
    color: "inherit",
    cursor: "pointer",
    borderRadius: "2px",
    padding: "0 1px",
  };
}

/**
 * Generates styling for overlapping highlighted text spans:
 * When multiple spans cover the same segment, renders a multi-color gradient background
 * and multi-color bottom border.
 */
export function getMultiSpanHighlightStyle(colors: (string | undefined)[]): CSSProperties {
  const validColors = colors
    .map((c) => standardizeColor(c ?? "#3b82f6") ?? "#3b82f6")
    .filter((c) => c.startsWith("#"));

  if (validColors.length === 0) return getSpanHighlightStyle();
  if (validColors.length === 1) return getSpanHighlightStyle(validColors[0]);

  const pct = Math.floor(100 / validColors.length);
  const bgStops = validColors
    .map((col, idx) => `${col}38 ${idx * pct}%, ${col}38 ${(idx + 1) * pct}%`)
    .join(", ");
  const borderStops = validColors
    .map((col, idx) => `${col} ${idx * pct}%, ${col} ${(idx + 1) * pct}%`)
    .join(", ");

  return {
    background: `linear-gradient(to bottom, ${bgStops})`,
    borderBottom: `2px solid`,
    borderImage: `linear-gradient(to right, ${borderStops}) 1`,
    color: "inherit",
    cursor: "pointer",
    borderRadius: "2px",
    padding: "0 1px",
  };
}

/**
 * Generates styling for a compact tag / badge representing a code.
 */
export function getCodeBadgeStyle(color?: string): CSSProperties {
  const baseHex = standardizeColor(color ?? "#6b7280") ?? "#6b7280";
  return {
    backgroundColor: `${baseHex}28`,
    borderColor: `${baseHex}88`,
    color: "#111827",
  };
}
