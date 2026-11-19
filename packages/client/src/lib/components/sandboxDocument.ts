import { RESIZE_SCRIPT, RESIZE_SCRIPT_HASH } from "@annotinder/contracts";

// `::html` values (docs/client.md §3, "::html"): shown in an iframe that
// - is sandboxed with scripts only (`allow-scripts`, no `allow-same-origin`):
//   it has an opaque origin, so it can't read the app, its storage or its
//   cookies; no forms, popups or navigating the app;
// - has a Content Security Policy that blocks every script but ours (by its
//   hash) and every request: no loading from other servers, only embedded
//   (data:) images and fonts and inline CSS;
// - reports its height with that one script, so it is as tall as its
//   content;
// - starts from a default style close to the app's (`defaultStyle`).
// The HTML can come from unit data, which the researcher may not have
// written (e.g. scraped articles).

const CSP = [
  "default-src 'none'",
  "img-src data:",
  "font-src data:",
  "style-src 'unsafe-inline'",
  `script-src '${RESIZE_SCRIPT_HASH}'`,
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

/** The app's look where the frame is shown, for the frame's default style. */
export interface FrameLook {
  colorScheme: string;
  color: string;
  fontSize: string;
  primary: string;
  border: string;
}

/**
 * A default style close to the app's: its font (if the coder's device has
 * it; the frame can't load it), text and link colours, light or dark, and
 * plain tables. The HTML's own CSS comes later, so it wins.
 */
function defaultStyle(look?: FrameLook): string {
  const base =
    "html,body{margin:0;overflow:hidden}body{display:flow-root}" +
    "body{font-family:'Geist Variable',Geist,ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;line-height:1.5}" +
    "img{max-width:100%;height:auto}table{border-collapse:collapse}th,td{padding:.25em .5em;text-align:left}";
  if (!look) return base;
  return (
    base +
    `:root{color-scheme:${look.colorScheme}}body{color:${look.color};font-size:${look.fontSize};background:transparent}` +
    `a{color:${look.primary}}th,td{border:1px solid ${look.border}}`
  );
}

/** The frame's document: the policy first (in <head>, where it counts), the default style, then the HTML, then the height script. */
export function sandboxDocument(html: string, look?: FrameLook): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}">` +
    `<style>${defaultStyle(look)}</style></head><body>${html}<script>${RESIZE_SCRIPT}</script></body></html>`
  );
}
