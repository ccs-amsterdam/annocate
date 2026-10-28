import type { ReactNode } from "react";

// A light highlighter for template text in help topics (code blocks with the
// language `template`, and the editable examples): block fences, values,
// suffixes, scripts and snippets, like the template editor's colours.

const TOKEN =
  /(^:{3,}[^\n]*$)|(\{\{[\s\S]*?\}\})(::(?:text|markdown|image|html))?|(\$(?:unit|var|session)(?:\.[A-Za-z_]\w*)+)(::(?:text|markdown|image|html))?|(\[\[[A-Za-z_]\w*\]\])|(\\\$)/gm;

const fence = "font-semibold text-violet-700 dark:text-violet-300";
const value = "text-sky-700 dark:text-sky-300";
const script = "text-amber-700 dark:text-amber-300";
const suffix = "text-pink-700 dark:text-pink-300";
const snippet = "text-emerald-700 dark:text-emerald-300";

export function highlightTemplate(source: string): ReactNode[] {
  const out: ReactNode[] = [];
  let at = 0;
  let key = 0;
  const push = (text: string, className?: string) => {
    if (text) out.push(className ? <span key={key++} className={className}>{text}</span> : text);
  };
  for (const m of source.matchAll(TOKEN)) {
    push(source.slice(at, m.index));
    if (m[1]) push(m[1], fence);
    else if (m[2]) {
      push(m[2], script);
      if (m[3]) push(m[3], suffix);
    } else if (m[4]) {
      push(m[4], value);
      if (m[5]) push(m[5], suffix);
    } else if (m[6]) push(m[6], snippet);
    else push(m[0]);
    at = m.index + m[0].length;
  }
  push(source.slice(at));
  return out;
}
