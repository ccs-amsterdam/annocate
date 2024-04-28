import { CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import rehypeExternalLinks from "rehype-external-links";

interface MarkdownProps {
  children: string;
  style?: CSSProperties;
}

const Markdown = ({ children, style = {} }: MarkdownProps) => {
  return (
    <div style={{ ...style }}>
      <ReactMarkdown rehypePlugins={[[rehypeExternalLinks, { target: "_blank" }]]}>{children}</ReactMarkdown>
    </div>
  );
};

export default Markdown;
