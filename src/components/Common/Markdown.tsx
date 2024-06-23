import { CSSProperties, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeExternalLinks from "rehype-external-links";
import rehypeRaw from "rehype-raw";
import DOMPurify from "dompurify";

interface MarkdownProps {
  children: string;
  style?: CSSProperties;
}

const Markdown = ({ children, style = {} }: MarkdownProps) => {
  return (
    <div style={{ ...style }} className="prose max-w-none dark:prose-invert">
      <ReactMarkdown
        components={{
          mark(props) {
            const { node, ...rest } = props;
            console.log(node, rest);
            const background = String(node?.properties?.background ?? "hsl(var(--secondary))");
            const color = String(node?.properties?.color ?? "hsl(var(--secondary-foreground))");
            console.log(color);
            return <span className="rounded px-1" style={{ background, color }} {...rest} />;
          },
          // "==": (props) => {
          //   const { node, ...rest } = props;
          //   console.log(node, rest);
          //   const background = String(node?.properties?.background ?? "hsl(var(--secondary))");
          //   const color = String(node?.properties?.color ?? "hsl(var(--secondary-foreground))");
          //   console.log(background);
          //   return <span className="rounded px-1" style={{ background, color }} {...rest} />;
          // },
        }}
        rehypePlugins={[[rehypeExternalLinks, { target: "_blank" }], rehypeRaw]}
      >
        {DOMPurify.sanitize(children)}
      </ReactMarkdown>
    </div>
  );
};

export default Markdown;
