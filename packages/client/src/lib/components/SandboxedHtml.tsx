import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FrameLoads, sandboxDocument, type FrameLook } from "./sandboxDocument";

// `::html` values in a sandboxed frame: see sandboxDocument.ts for its policy.
// The policy can't keep the HTML from sending the frame elsewhere (a link, a
// meta refresh), so a frame that leaves its document is taken away (`FrameLoads`).

/** Reads the app's look at an element (its colours follow light or dark mode). */
function lookAt(element: HTMLElement): FrameLook {
  const style = getComputedStyle(element);
  const color = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    colorScheme: style.colorScheme && style.colorScheme !== "normal" ? style.colorScheme : "light",
    color: style.color,
    fontSize: style.fontSize,
    primary: color("--primary", style.color),
    border: color("--border", "currentColor"),
  };
}

/** The largest height a frame may ask for (in px), so a runaway document can't grow without end. */
const MAX_HEIGHT = 8000;

export function SandboxedHtml({ html, title = "HTML content" }: { html: string; title?: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [look, setLook] = useState<FrameLook>();
  // The look where the frame is, before the frame is made (so its document
  // loads once), and again when the coder switches light/dark mode.
  useLayoutEffect(() => {
    const read = () =>
      box.current &&
      setLook((prev) => {
        const next = lookAt(box.current!);
        return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
      });
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
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
    <div ref={box}>
      {look && <SandboxFrame ref={frame} srcDoc={sandboxDocument(html, look)} title={title} height={height} />}
    </div>
  );
}

/** The frame itself (sandboxed: scripts only, no same origin), showing a `sandboxDocument` until it leaves it. */
export function SandboxFrame({
  ref,
  srcDoc,
  title,
  height,
}: {
  ref?: React.Ref<HTMLIFrameElement>;
  srcDoc: string;
  title: string;
  height?: number;
}) {
  const [loads] = useState(() => new FrameLoads());
  const [left, setLeft] = useState(false);
  useLayoutEffect(() => loads.show(srcDoc), [loads, srcDoc]);
  if (left) return null;
  return (
    <iframe
      ref={ref}
      title={title}
      sandbox="allow-scripts"
      srcDoc={srcDoc}
      onLoad={() => setLeft(loads.load())}
      className="block w-full border-0"
      style={{ height: height || undefined }}
    />
  );
}
