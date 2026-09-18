import { createRef } from "react";
import { ProcessedMarkdownField, RenderedMarkdown } from "@/app/types";
import Markdown from "@/components/Common/Markdown";

export default function renderMarkdown(markdown_fields: ProcessedMarkdownField[], fieldRefs: any): RenderedMarkdown {
  const rm: RenderedMarkdown = {};

  for (let markdownField of markdown_fields) {
    fieldRefs[markdownField.name] = createRef();

    // It should not be possible that value is an array due to unfoldFields,
    // but typescript doesn't catch that
    let value = markdownField.value;
    if (Array.isArray(value)) value = value.join("");

    if (!markdownField.style) markdownField.style = {};
    if (!markdownField.style.padding) markdownField.style.padding = "10px";

    rm[markdownField.name] = (
      <div
        ref={fieldRefs[markdownField.name]}
        key={"markdown-" + markdownField.name}
        className="field"
        style={{
          gridArea: markdownField.grid_area,
          fontSize: "1rem",
        }}
      >
        <Markdown style={markdownField.style}>{value}</Markdown>
      </div>
    );
  }

  return rm;
}
