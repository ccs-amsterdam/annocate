import React, { useState, useEffect, CSSProperties, useMemo } from "react";
import AnnotateNavigation from "./components/AnnotateNavigation";
import Body from "./components/Body";
import useSpanSelector from "./hooks/useSpanSelector";
import useRelationSelector from "./hooks/useRelationSelector";
import SelectVariable from "./components/SelectVariable";

import useVariableMap from "./components/useVariableMap";
import { VariableMap, Annotation, SetState, TriggerSelector, CodebookVariable, Doc, Unit } from "@/app/types";
import { useCallback } from "react";
import styled from "styled-components";
import { useUnit } from "../AnnotatorProvider/AnnotatorProvider";
import { useQuery } from "@tanstack/react-query";
import { useContent } from "./hooks/useContent";

const DocumentContainer = styled.div`
  display: flex;
  position: relative;
  height: 100%;
  max-height: 100%;
  flex-direction: column;
  color: var(--foreground);
  background: hsl(var(--background));
  z-index: 100;
  font-size: var(--font-size);
`;

interface DocumentProps {
  /** An array of variables */
  variables?: CodebookVariable[];
  /** If true, always show all annotations. This makes sense if the annotations property
   * is already the selection you need. But when coding multiple variables, it can be
   * better to set to false, so coders only see annotations of the variable they're working on
   */
  showAll?: boolean;
  /** for getting acces to annotations from the parent component
   *  If not given, Document is automatically in read only mode (i.e. cannot make annotations) */
  onChangeAnnotations?: (unitId: string, value: Annotation[]) => void;
  /** returnVariableMap */
  returnVariableMap?: SetState<VariableMap>;
  /**
   * a callback for returning a selector function to edit annotations
   */
  returnSelectors?: SetState<Record<string, TriggerSelector | null>>;
  /** A callback function that is called when the document is ready. This is mainly usefull for
   * managing layout while waiting for document to load
   */
  onReady?: Function;
  /** a boolean value for blocking all event listeners */
  blockEvents?: boolean;
  /** Names of fields to focus on, or Annotation objects to focus on */
  focus?: string[];
  /** Should the text be centered? */
  centered?: boolean;
  /** CSSProperties for the body container  */
  bodyStyle?: CSSProperties;
}

interface DocumentReadyProps extends DocumentProps {
  content: Doc;
  contentLoading: boolean;
  unit: Unit;
  annotationLib: any;
  annotationManager: any;
}

const Document = (props: DocumentProps) => {
  const { unit, annotationLib, annotationManager } = useUnit();
  const { loading, content } = useContent();

  if (!content) return null;

  return (
    <DocumentReady
      {...props}
      content={content}
      contentLoading={loading}
      unit={unit}
      annotationLib={annotationLib}
      annotationManager={annotationManager}
    />
  );
};

/**
 * This is hopefully the only Component in this folder that you'll ever see. It should be fairly isolated
 * and easy to use, but behind the scenes it gets dark real fast.
 */
const DocumentReady = ({
  content,
  contentLoading,
  unit,
  annotationLib,
  annotationManager,
  variables,
  showAll,
  onChangeAnnotations,
  returnVariableMap,
  returnSelectors,
  onReady,
  blockEvents,
  focus,
  centered,
  bodyStyle,
}: DocumentReadyProps) => {
  const [selectedVariable, setSelectedVariable] = useState<string>("");
  const [variable, fullVariableMap, variableMap, showValues, variableType] = useVariableMap(
    variables,
    selectedVariable,
  );

  // keep track of current tokens object, to prevent rendering annotations on the wrong text
  const [currentUnit, setCurrentUnit] = useState<Doc>(() => content);

  const [spanSelectorPopup, spanSelector, spanSelectorOpen] = useSpanSelector(
    content,
    annotationLib,
    annotationManager,
    variable,
  );
  const [relationSelectorPopup, relationSelector, relationSelectorOpen] = useRelationSelector(
    content,
    annotationLib,
    annotationManager,
    variable,
  );

  useEffect(() => {
    returnSelectors && returnSelectors({ span: spanSelector, relation: relationSelector });
  }, [returnSelectors, spanSelector, relationSelector]);

  useEffect(() => {
    if (returnVariableMap && variableMap) returnVariableMap(variableMap);
  }, [variableMap, returnVariableMap]);

  const onBodyReady = useCallback(() => {
    if (onReady) onReady();
    setCurrentUnit(content);
  }, [onReady, content, setCurrentUnit]);

  const triggerSelector = variableType === "relation" ? relationSelector : spanSelector;
  const selectorOpen = variableType === "relation" ? relationSelectorOpen : spanSelectorOpen;
  const selectorPopup = variableType === "relation" ? relationSelectorPopup : spanSelectorPopup;
  const annotationMode = variableType === "relation" ? "relationMode" : "spanMode";
  const currentUnitReady = currentUnit === content;

  if (!content.tokens && !content.imageFields) return null;

  const editMode = variable && "editMode" in variable ? !!variable.editMode : false;

  return (
    <DocumentContainer className={`${annotationMode} ${(editMode && "editMode") || ""}`}>
      <SelectVariable
        variables={variables}
        variable={selectedVariable}
        setVariable={setSelectedVariable}
        blockEvents={!!blockEvents}
      />

      <Body
        tokens={content.tokens}
        text_fields={content.textFields || []}
        metaFields={[]}
        image_fields={content.imageFields || []}
        markdown_fields={content.markdownFields || []}
        grid={content.grid}
        onReady={onBodyReady}
        bodyStyle={bodyStyle}
        focus={focus}
        centered={!!centered}
        readOnly={!onChangeAnnotations}
        currentUnitReady={currentUnitReady}
      />

      <AnnotateNavigation
        tokens={content.tokens || []}
        annotationLib={annotationLib}
        variable={variable}
        variableType={variableType}
        showValues={showValues}
        disableAnnotations={!onChangeAnnotations || !variableMap}
        editMode={editMode}
        triggerSelector={triggerSelector}
        eventsBlocked={!!(selectorOpen || blockEvents || contentLoading)}
        showAll={!!showAll}
        currentUnitReady={currentUnitReady}
      />

      {selectorPopup || null}
    </DocumentContainer>
  );
};

export default React.memo(Document);
