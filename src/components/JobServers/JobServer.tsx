import {
  Annotation,
  CodebookPhase,
  CodebookVariable,
  JobBlocksResponse,
  JobState,
  Layout,
  Progress,
} from "@/app/types";
import { createParentMap } from "@/functions/treeFunctions";

// TODO:
// We'll rebrand jobBlocksResponse as Codebook
// CodebookPhases breaks this into the outer blocks
// in Progress we'll add the question for the SurveyPhase, so that
// we can show these in the dropdown menu.
// For annotation phases we have: annotationPhase, annotationBlock, question, annotation
// For survey phases we have: surveyBlock, question
// For annotationPhase, we'll have a dropdown menu showing just the phase name.
// clicking this goes to the current unit in the phase. Or maybe make this a subgroup
// with options: "Go to first unit", "Go to current unit"

// to consider:
// Make an additional column in blocks for whether or not a unit specific item.
// That way we can just have a Block and Question type. Then whether a block
// can have a 'layout' or an Annotation type depends on the 'unit' column.
// (could also call this the 'annotationPhase' column).
// In additon to checking for parent type, we check that a parent must also
// have the same 'annotationPhase' value.

// Here need some way to get the done units per phase
interface UnitProgress {
  blockId: number;
  nTotal: number;
  nCoded: number;
}

function initJob(codebook: JobBlocksResponse[], globalAnnotations: Annotation[]) {
  const codebookPhases = createCodebookPhases(codebook);
  // const jobState = initJobState(globalAnnotations);
  const progress = initProgress(codebookPhases, globalAnnotations);
  return {
    progress,
  };
}

function initProgress(codebookPhases: CodebookPhase[], globalAnnotations: Annotation[]): Progress {
  const progress: Progress = {
    phase: 0,
    phasesCoded: 0,
    phases: [],
  };

  for (let codebookPhase of codebookPhases) {
  }
  return progress;
}

// annotationBlocks and annotationQuestions can both have
// layout. So users can nest annotationBlocks if they want.
// The codebook is divided into phases, but these are hidden
// from the user. Coder only sees questions (not blocks)

// function initJobState(globalAnnotations: Annotation[]): JobState {}

export function createCodebookPhases(blocks: JobBlocksResponse[]): CodebookPhase[] {
  const parentMap = createParentMap(blocks);

  const phases = blocks.filter((b) => b.parentId === null);

  return phases.map((phase) => ({
    type: phase.type,
    variables: recursiveGetVariables(parentMap, phase, {}),
  }));
}

interface Inheritable {
  layout?: Layout;
}

function recursiveGetVariables(
  parentMap: Map<number | null, JobBlocksResponse[]>,
  parent: JobBlocksResponse,
  inherit: Inheritable,
): CodebookVariable[] {
  // Children in JobBlocksResponse are sorted
  const children = parentMap.get(parent.id) ?? [];

  // inheritables
  if ("layout" in parent.content) inherit.layout = parent.content.layout;

  const variables: CodebookVariable[] = [];
  for (let child of children) {
    const isLeaf = child.type === "annotationQuestion" || child.type === "surveyQuestion";

    if (isLeaf) {
      const variable: CodebookVariable = { name: child.name, ...child.content, ...inherit };
      variables.push(variable);
    } else {
      variables.push(...recursiveGetVariables(parentMap, child, inherit));
    }
  }

  return variables;
}
