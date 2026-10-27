import { useEffect, useRef, useState } from "react";

// `::html` values (docs/client.md §3, "HTML"): shown in an iframe that
// - is sandboxed with scripts only (`allow-scripts`, no `allow-same-origin`):
//   it has an opaque origin, so it can't read the app, its storage or its
//   cookies; no forms, popups or navigating the app;
// - has a Content Security Policy that blocks every script but ours (by its
//   hash) and every request: no loading from other servers, only embedded
//   (data:) images and fonts and inline CSS;
// - reports its height with that one script, so it is as tall as its
//   content.
// The HTML can come from unit data, which the researcher may not have
// written (e.g. scraped articles).

/** The only script allowed in the frame: it reports the content's height. */
export const RESIZE_SCRIPT =
  'new ResizeObserver(function(){parent.postMessage({annotinderFrameHeight:document.documentElement.scrollHeight},"*")}).observe(document.documentElement);';
/** sha256 of RESIZE_SCRIPT, base64 (checked in SandboxedHtml.test.tsx). */
export const RESIZE_SCRIPT_HASH = "sha256-fHiWL56IjJT4rcBTHsY5Dl/W4AAos+y2oe2+gI2apE0=";

const CSP = [
  "default-src 'none'",
  "img-src data:",
  "font-src data:",
  "style-src 'unsafe-inline'",
  `script-src '${RESIZE_SCRIPT_HASH}'`,
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

/** The frame's document: the policy first (in <head>, where it counts), then the HTML, then the height script. */
export function sandboxDocument(html: string): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}">` +
    `<style>html,body{margin:0;overflow:hidden}</style></head><body>${html}<script>${RESIZE_SCRIPT}</script></body></html>`
  );
}

/** The largest height a frame may ask for (in px), so a runaway document can't grow without end. */
const MAX_HEIGHT = 8000;

export function SandboxedHtml({ html, title = "HTML content" }: { html: string; title?: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== frame.current?.contentWindow) return;
      const h = (e.data as { annotinderFrameHeight?: unknown } | null)?.annotinderFrameHeight;
      if (typeof h === "number" && Number.isFinite(h)) setHeight(Math.min(Math.max(h, 0), MAX_HEIGHT));
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  return (
    <iframe
      ref={frame}
      title={title}
      sandbox="allow-scripts"
      srcDoc={sandboxDocument(html)}
      className="block w-full border-0"
      style={{ height: height || undefined }}
    />
  );
}
