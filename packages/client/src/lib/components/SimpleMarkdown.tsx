import type { ReactNode } from "react";

/**
 * A deliberately tiny, non-HTML-injecting markdown renderer: headers (#/##/###),
 * **bold**, *italic*, and paragraphs split on blank lines. No lists, links,
 * images, or raw HTML -- if richer markdown is needed later, swap this out
 * for a real library (e.g. react-markdown) rather than extending this by hand.
 * Returns React nodes directly (never `dangerouslySetInnerHTML`), so there's
 * no HTML-injection risk even though templates are admin-authored/trusted.
 */
export function SimpleMarkdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim().length > 0);

  return (
    <>
      {blocks.map((block, i) => {
        const headerMatch = /^(#{1,3})\s+(.*)$/.exec(block.trim());
        if (headerMatch) {
          const level = headerMatch[1].length;
          const content = renderInline(headerMatch[2]);
          if (level === 1) return <h1 key={i}>{content}</h1>;
          if (level === 2) return <h2 key={i}>{content}</h2>;
          return <h3 key={i}>{content}</h3>;
        }
        return <p key={i}>{renderInline(block)}</p>;
      })}
    </>
  );
}

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}
