import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { headingId, helpLink } from "./topicText";
import { openHelp } from "./helpStore";
import { HelpExample } from "./HelpExample";
import { highlightTemplate } from "./highlight";

interface HastNode {
  type: string;
  value?: string;
  tagName?: string;
  properties?: { className?: string[] };
  children?: HastNode[];
}

const textOf = (node: HastNode | undefined): string =>
  node?.type === "text" ? (node.value ?? "") : (node?.children ?? []).map(textOf).join("");

/**
 * Markdown as the help shows it (a topic's body; the guide's steps): heading
 * ids, links between topics (`slug`: the topic the text is in, for `#heading`
 * links), live examples and template code.
 */
export function HelpMarkdown({ slug, body }: { slug: string; body: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents(slug)}>
      {body}
    </ReactMarkdown>
  );
}

function heading(Tag: "h2" | "h3") {
  return function Heading({ node, children }: { node?: unknown; children?: ReactNode }) {
    return <Tag id={headingId(textOf(node as HastNode))}>{children}</Tag>;
  };
}

/** How topic markdown renders: heading ids, links between topics, examples and template code. */
function markdownComponents(slug: string): Components {
  return {
    h2: heading("h2"),
    h3: heading("h3"),
    a({ href, children }) {
      const link = href ? helpLink(href, slug) : null;
      if (link)
        return (
          <a
            href={`#${link.anchor ?? ""}`}
            onClick={(e) => {
              e.preventDefault();
              openHelp(link.anchor ? `${link.slug}#${link.anchor}` : link.slug);
            }}
          >
            {children}
          </a>
        );
      return (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    },
    pre({ node, children }) {
      const code = (node as HastNode | undefined)?.children?.find((c) => c.tagName === "code");
      const language = code?.properties?.className?.find((c) => c.startsWith("language-"))?.slice("language-".length);
      const text = textOf(code).replace(/\n$/, "");
      if (language === "example") return <HelpExample source={text} />;
      if (language === "template") return <pre>{highlightTemplate(text)}</pre>;
      return <pre>{children}</pre>;
    },
    table({ children }) {
      return (
        <div className="overflow-x-auto">
          <table>{children}</table>
        </div>
      );
    },
  };
}
