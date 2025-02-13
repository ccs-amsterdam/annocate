import React, { CSSProperties, useEffect, useRef, useState, useMemo, ReactElement } from "react";
import Meta from "./Meta";
import renderText from "@/functions/renderText";
import renderImages from "@/functions/renderImages";
import renderMarkdown from "@/functions/renderMarkdown";
import FocusOverlay from "./FocusOverlay";

import {
  PreparedGrid,
  FieldRefs,
  ProcessedImageField,
  ProcessedMarkdownField,
  MetaField,
  ProcessedTextField,
  Token,
} from "@/app/types";
import styled from "styled-components";
import { Loader } from "../../../styled/Styled";
import { useHeight } from "@/hooks/useHeight";

const DocumentContent = styled.div<{
  $grid?: PreparedGrid;
  $centered: boolean;
  $highLines: boolean;
}>`
  display: ${(p) => (p.$grid?.areas ? "grid" : null)};
  margin: ${(p) => (p.$centered ? "auto" : "")};
  padding-top: 0px;
  padding-bottom: 0px;
  width: 100%;
  z-index: 1;

  grid-template-areas: ${(p) => p.$grid?.areas};
  grid-template-columns: ${(p) => p.$grid?.columns};
  ${(p) => (p.$grid?.rows ? `grid-template-rows: ${p.$grid.rows};` : `grid-auto-rows: min-content;`)}
  p {
    line-height: ${(p) => (p.$highLines ? "2.5em" : "1.5em")};
  }
`;

const BodyContainer = styled.div`
  height: 100%;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: auto;
  scroll-behavior: smooth;
`;

interface BodyProps {
  tokens?: Token[];
  text_fields: ProcessedTextField[];
  metaFields: MetaField[];
  image_fields: ProcessedImageField[];
  markdown_fields: ProcessedMarkdownField[];
  grid?: PreparedGrid;
  onReady: () => any;
  bodyStyle: CSSProperties | undefined;
  focus: string[] | undefined;
  centered: boolean;
  readOnly: boolean;
  currentUnitReady: boolean;
}

const Body = ({
  tokens,
  text_fields,
  metaFields,
  image_fields,
  markdown_fields,
  grid,
  onReady,
  bodyStyle = {},
  focus,
  centered,
  readOnly,
  currentUnitReady,
}: BodyProps) => {
  const [content, setContent] = useState<(ReactElement<any> | ReactElement<any>[])[]>([]);
  const fieldRefs: FieldRefs = useMemo(() => ({}), []);
  const containerRef = useRef(null);
  const [imagesLoaded, setImagesLoaded] = useState(true);

  useEffect(() => {
    if (!tokens) return;
    const text = renderText(tokens, text_fields, containerRef, fieldRefs);
    const images = renderImages(image_fields, setImagesLoaded, containerRef);
    const markdown = renderMarkdown(markdown_fields, fieldRefs);

    const content: (ReactElement<any> | ReactElement<any>[])[] = [];
    if (text) for (const f of text_fields) content.push(text[f.name]);
    if (images) for (const f of image_fields) content.push(images[f.name]);
    if (markdown) for (const f of markdown_fields) content.push(markdown[f.name]);
    setContent(content);

    const timer = setInterval(() => {
      if (tokens.length > 0 && !tokens[0]?.ref?.current) return;
      onReady();
      clearInterval(timer);
    }, 50);
  }, [tokens, text_fields, image_fields, markdown_fields, onReady, setImagesLoaded, fieldRefs]);

  if (tokens == null) return null;

  return (
    <BodyContainer
      key="bodycontainer"
      id="bodycontainer"
      ref={containerRef}
      className="BodyContainer"
      style={{
        ...bodyStyle,
      }}
    >
      <Meta metaFields={metaFields} />
      <div
        key="fields"
        style={{
          position: "relative",
          flex: "1 1 97%",
          display: "flex",
          paddingTop: "10px",
          width: "100%",
        }}
      >
        <Loader $active={!imagesLoaded || !currentUnitReady} $radius={0} />
        <DocumentContent
          $centered={centered}
          $highLines={!readOnly}
          $grid={grid}
          key="content"
          className="DocumentContent"
        >
          <FocusOverlay key="focusoverlay" fieldRefs={fieldRefs} focus={focus || []} containerRef={containerRef} />
          {content}
        </DocumentContent>
      </div>
    </BodyContainer>
  );
};

export default React.memo(Body);
