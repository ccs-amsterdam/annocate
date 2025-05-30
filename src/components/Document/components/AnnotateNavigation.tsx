import Popup from "@/components/Common/Popup";
import useAnnotationEvents from "@/components/Document/hooks/useAnnotationEvents";
import { getValidTokenDestinations, getValidTokenRelations } from "@/functions/relations";
import standardizeColor from "@/functions/standardizeColor";
import { getColorGradient } from "@/functions/tokenDesign";
import { ReactElement, useEffect, useMemo, useRef } from "react";

import {
  Annotation,
  AnnotationLibrary,
  CodebookVariable,
  Token,
  TokenSelection,
  TriggerSelector,
  ValidTokenDestinations,
  ValidTokenRelations,
  VariableMap,
  VariableType,
} from "@/app/types";
import DrawArrows from "./DrawArrows";

interface AnnotateNavigationProps {
  tokens: Token[];
  annotationLib: AnnotationLibrary;
  variable: CodebookVariable | null;
  variableType: VariableType | null;
  showValues: VariableMap | null;
  disableAnnotations: boolean;
  editMode: boolean;
  triggerSelector: TriggerSelector | null;
  eventsBlocked: boolean;
  showAll: boolean;
  currentUnitReady: boolean;
}

/**
 * The NavigationEvents component handles all eventlisteners
 * AnnotateNavigation furthermore takes the position and selection information
 * from the navigation to highlight the tokens and show popups
 */
const AnnotateNavigation = ({
  tokens,
  annotationLib,
  variable,
  variableType,
  showValues,
  disableAnnotations,
  editMode,
  triggerSelector,
  showAll,
  eventsBlocked,
  currentUnitReady,
}: AnnotateNavigationProps) => {
  const hasSelection = useRef(false);
  const { tokenSelection, alternative } = useAnnotationEvents(
    tokens,
    annotationLib,
    triggerSelector,
    editMode,
    variableType,
    eventsBlocked || disableAnnotations,
  );
  const showEdge = variableType === "relation" || alternative;

  const validRelations: ValidTokenRelations | null = useMemo(() => {
    if (!variable) return null;
    return getValidTokenRelations(annotationLib, variable);
  }, [annotationLib, variable]);

  const validDestinations: ValidTokenDestinations | null = useMemo(() => {
    if (!validRelations || !tokenSelection) return null;
    return getValidTokenDestinations(annotationLib, validRelations, tokenSelection);
  }, [annotationLib, validRelations, tokenSelection]);

  useEffect(() => {
    if (!currentUnitReady) return;
    highlightAnnotations(tokens, validDestinations || validRelations, annotationLib, showValues, showAll, variableType);
  }, [tokens, validRelations, validDestinations, annotationLib, showValues, showAll, variableType, currentUnitReady]);

  useEffect(() => {
    setSelectionAsCSSClass(tokens, showEdge, tokenSelection, hasSelection);
  }, [tokens, showEdge, tokenSelection, editMode, hasSelection]);

  return (
    <>
      <AnnotationPopup
        tokens={tokens}
        tokenIndex={tokenSelection?.[1] ?? tokenSelection?.[0]}
        annotationLib={annotationLib}
        showValues={showValues}
      />
      <DrawArrows
        active={showEdge}
        tokens={tokens}
        annotationLib={annotationLib}
        triggerSelector={triggerSelector}
        tokenSelection={tokenSelection}
      />
    </>
  );
};

const highlightAnnotations = (
  tokens: Token[],
  validTokens: ValidTokenRelations | ValidTokenDestinations | null,
  annotationLib: AnnotationLibrary,
  showValues: VariableMap | null,
  showAll: boolean,
  variableType: string | null,
) => {
  // loop over tokens. Do some styling. Then get the (allowed) annotations for this token,
  // and apply styling to annotated tokens
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (!token.ref?.current) continue;
    if (variableType === "relation") {
      const canSelect = !validTokens || validTokens[token.index];
      if (canSelect) {
        token.ref.current.classList.add("can-select");
      } else {
        token.ref.current.classList.remove("can-select");
      }
    }

    let tokenAnnotations = allowedAnnotations(annotationLib, token.index, showValues, showAll);
    if (tokenAnnotations.length === 0) {
      if (token.ref.current.classList.contains("annotated")) {
        token.ref.current.classList.remove("annotated");
        setTokenColor(token);
      }
      continue;
    }

    setAnnotationAsCSSClass(token, tokenAnnotations);
  }
};

const allowedAnnotations = (
  annotationLib: AnnotationLibrary,
  tokenIndex: number,
  showValues: VariableMap | null,
  showAll: boolean,
) => {
  // get all annotations that are currently 'allowed', meaning that the variable is selected
  // and the codes are valid and active codes in the codebook
  const annotationIdsOnIndex = annotationLib?.byToken?.[tokenIndex] || [];

  let annotations: Annotation[] = [];
  for (let id of annotationIdsOnIndex) {
    const a = annotationLib.annotations[id];

    if (!showAll) {
      if (!showValues?.[a.variableId]) continue;
      //const codeMap = showValues[a.variable].codeMap;
      //const code = a.value;
      //if (!codeMap[a.value] && code !== "EMPTY") continue;
    }

    annotations.push(a);
  }
  return annotations;
};

const setAnnotationAsCSSClass = (token: Token, annotations: Annotation[]) => {
  // Set specific classes for nice css to show the start/end of codes
  let nLeft = 0;
  let nRight = 0;

  const spanColors: any = {
    pre: [],
    text: [],
    post: [],
  };
  const relationColors: any = {
    pre: [],
    text: [],
    post: [],
  };

  let tokenlabel: string[] = [];

  let nSpanAnnotations = 0;
  let nRelationAnnotations = 0;

  for (let annotation of annotations) {
    if (annotation.type === "span") {
      nSpanAnnotations++;
      const color = standardizeColor(annotation.client.color, "50");
      tokenlabel.push(String(annotation.code));

      spanColors.text.push(color);
      if (annotation.span?.[0] === token.index) {
        nLeft++;
      } else spanColors.pre.push(color);
      if (annotation.span?.[1] === token.index) {
        nRight++;
      } else spanColors.post.push(color);
    }

    if (annotation.type === "relation") {
      nRelationAnnotations++;
      const color = standardizeColor(annotation.client.color, "90");
      tokenlabel.push(String(annotation.code));

      relationColors.text.push(color);
      if (annotation.client.positions?.has(token.index)) relationColors.pre.push(color);
      if (annotation.client.positions?.has(token.index + 1)) relationColors.post.push(color);
    }
  }

  const allLeft = nLeft === nSpanAnnotations;
  const allRight = nRight === nSpanAnnotations;
  const anyLeft = nLeft > 0;
  const anyRight = nRight > 0;

  const cl = token.ref.current.classList;
  cl.add("annotated");
  allLeft ? cl.add("allLeft") : cl.remove("allLeft");
  anyLeft && !allLeft ? cl.add("anyLeft") : cl.remove("anyLeft");
  allRight ? cl.add("allRight") : cl.remove("allRight");
  anyRight && !allRight ? cl.add("anyRight") : cl.remove("anyRight");
  if (nRelationAnnotations > 0) cl.add("hasRelation");

  const spanText = getColorGradient(spanColors.text);
  const spanPre = allLeft ? "hsl(var(--background))" : getColorGradient(spanColors.pre);
  const spanPost = allRight ? "hsl(var(--background))" : getColorGradient(spanColors.post);

  const relationText = getColorGradient(relationColors.text);
  const relationPre = relationColors.pre.length === 0 ? "var(--background)" : getColorGradient(relationColors.pre);
  const relationPost = relationColors.post.length === 0 ? "var(--background)" : getColorGradient(relationColors.post);

  setTokenColor(token, spanPre, spanText, spanPost, relationPre, relationText, relationPost, nRelationAnnotations);
};

const setTokenColor = (
  token: Token,
  spanPre?: string,
  spanText?: string,
  spanPost?: string,
  relationPre?: string,
  relationText?: string,
  relationPost?: string,
  nRelations?: number,
) => {
  const [pre, text, post] = token.ref.current.children;
  pre.style.background = spanPre;
  text.style.background = spanText;
  post.style.background = spanPost;

  const preRelation = pre.children[0];
  const textRelation = text.children[0];
  const postRelation = post.children[0];

  preRelation.style.background = relationPre;
  textRelation.style.background = relationText;
  postRelation.style.background = relationPost;

  const height = `${Math.min((nRelations || 0) * 0.2, 0.5)}em`;
  preRelation.style.height = height;
  textRelation.style.height = height;
  postRelation.style.height = height;
};

const setSelectionAsCSSClass = (tokens: Token[], asEdge: boolean, selection: TokenSelection, hasSelection: any) => {
  if (!selection || selection.length === 0 || selection[0] === null) return;
  let [from, to] = selection;
  if (to !== null && from > to) [to, from] = [from, to];

  if (from === null || to === null) {
    // if the current tokenSelecction would only remove the selection,
    // and there is no current selection, we can skip the whole process
    if (!hasSelection.current) return;
    if (asEdge) return;
  }
  hasSelection.current = false;
  for (let token of tokens) {
    if (!token.ref?.current) continue;
    token.ref.current.classList.remove("tapped");
    if (from === null || to === null || asEdge) {
      token.ref.current.classList.remove("selected");
      continue;
    }

    let selected = false;
    if (token.arrayIndex && from != null && to != null && token.arrayIndex >= from && token.arrayIndex <= to) {
      selected = true;
      hasSelection.current = true;
    }

    const cl = token.ref.current.classList;
    if (selected && token.codingUnit) {
      const left = from === token.arrayIndex;
      const right = to === token.arrayIndex;
      cl.add("selected");
      left ? cl.add("start") : cl.remove("start");
      right ? cl.add("end") : cl.remove("end");
      hasSelection.current = true;
    } else {
      cl.remove("selected");
    }
  }
};

interface AnnotationPopupProps {
  tokens: Token[];
  tokenIndex: number | undefined;
  annotationLib: AnnotationLibrary;
  showValues: VariableMap | null;
}

const AnnotationPopup = ({ tokens, tokenIndex, annotationLib, showValues }: AnnotationPopupProps) => {
  const ref = useRef<HTMLDivElement>(undefined);

  const content = useMemo(() => {
    if (!tokenIndex) return null;
    if (!tokens?.[tokenIndex]?.ref) return null;
    const annotationIds = annotationLib.byToken[tokens[tokenIndex].index];
    if (!annotationIds) return null;

    const tokenAnnotations = annotationIds.map((id) => annotationLib.annotations[id]);
    const ids = Object.keys(tokenAnnotations);
    const list = ids.reduce((arr: ReactElement<any>[], id, i) => {
      const variableId = tokenAnnotations[i].variableId;
      const value = tokenAnnotations[i].code;
      if (!showValues?.[variableId]) return arr;

      const color = standardizeColor(tokenAnnotations[i].client.color);

      arr.push(
        <li
          key={i}
          style={{
            backgroundColor: color,
            padding: "0.3em",
          }}
        >
          {/* <b>{variable}</b>
            {": " + value} */}
          <b>{value}</b>
        </li>,
      );
      return arr;
    }, []);

    if (list.length === 0) return null;
    return <ul>{list}</ul>;
    //setRefresh(0);
  }, [tokens, tokenIndex, annotationLib, showValues]);

  useEffect(() => {
    if (!tokenIndex) return;
    const tokenRef = tokens?.[tokenIndex]?.ref;
    if (!tokenRef) return;
  }, [ref, tokens, tokenIndex]);

  if (!content || !tokenIndex) return null;
  const tokenRef = tokens?.[tokenIndex]?.ref;

  return (
    <Popup controlledOpen={true} triggerRef={tokenRef} noPointerEvents>
      {content}
    </Popup>
  );
};

export default AnnotateNavigation;
