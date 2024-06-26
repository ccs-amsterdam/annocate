import { createRef } from "react";
import { MarkdownField, RenderedMarkdown } from "@/app/types";
import Markdown from "@/components/Common/Markdown";

export default function renderMarkdown(markdown_fields: MarkdownField[], fieldRefs: any): RenderedMarkdown {
  const rm: RenderedMarkdown = {};

  for (let markdownField of markdown_fields) {
    fieldRefs[markdownField.name] = createRef();

    // It should not be possible that value is an array due to unfoldFields,
    // but typescript doesn't catch that
    let value = markdownField.value;
    if (Array.isArray(value)) value = value.join("");

    rm[markdownField.name] = (
      <div
        ref={fieldRefs[markdownField.name]}
        key={"markdown-" + markdownField.name}
        className="field"
        style={{
          gridArea: markdownField.grid_area,
          padding: "10px",
          margin: "0px 10px 0px 10px",
          //width: "100%",
          fontSize: "1em",
          //alignSelf: "center",
          //textAlign: "justify",
          hyphens: "auto",
          ...(markdownField.style || {}),
        }}
      >
        <Markdown style={{ hyphens: "auto" }}>{value}</Markdown>
      </div>
    );
  }

  return rm;
}
