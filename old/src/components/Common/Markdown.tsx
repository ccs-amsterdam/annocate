import { CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

interface MarkdownProps {
  children: string;
  compact?: boolean;
  style?: CSSProperties;
}

const Markdown = ({ children, compact, style = {} }: MarkdownProps) => {
  return (
    <div style={{ ...style }} className={`${compact ? "prose-sm" : "prose"}   w-full min-w-0 dark:prose-invert `}>
      <ReactMarkdown
        components={{
          mark(props) {
            const { node, ...rest } = props;
            const background = String(node?.properties?.background ?? "hsl(var(--secondary))");
            const color = String(node?.properties?.color ?? "hsl(var(--secondary-foreground))");
            return <span className="rounded px-1" style={{ background, color }} {...rest} />;
          },
          // span(props) {
          //   const style = props?.node?.properties;
          //   console.log(style);
          //   return <span {...props} />;
          // },
          a(props) {
            return <a {...props} target="_blank" rel="noopener noreferrer" />;
          },
        }}
        rehypePlugins={[
          rehypeRaw,
          [
            rehypeSanitize,
            {
              ...defaultSchema,
              tagNames: [...(defaultSchema.tagNames || []), "mark", "u"],
              // attributes: {
              //   ...defaultSchema.attributes,
              //   a: [...(defaultSchema.attributes?.a || [])],
              // },
            },
          ],
        ]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
};

export default Markdown;
