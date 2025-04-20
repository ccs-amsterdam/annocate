import { CSSProperties, Dispatch, MutableRefObject, ReactElement, RefObject, SetStateAction } from "react";
import { z } from "zod";
import {
  AnnotateProgressSchema,
  AnnotateUnitSchema,
  GetJobStateResponseSchema,
  GetUnitResponseSchema,
  JobStateAnnotationsSchema,
  PhaseTypeSchema,
  ProgressStatusSchema,
} from "./api/annotate/[jobId]/schemas";
import {
  AnnotationSchema,
  RelationAnnotationSchema,
  SpanAnnotationSchema,
  QuestionAnnotationSchema,
} from "./api/projects/[projectId]/annotations/schemas";
import {
  CodebookCodeSchema,
  CodebookAnnotationRelationSchema,
  CodebookQuestionVariableSchema,
  CodebookVariableItemSchema,
  CodebookAnnotationVariableSchema,
} from "./api/projects/[projectId]/jobs/[jobId]/codebookNodes/variableSchemas";

import {
  UnitFieldLayoutSchema,
  UnitLayoutGridSchema,
  UnitLayoutSchema,
} from "./api/projects/[projectId]/jobs/[jobId]/codebookNodes/layoutSchemas";
import {
  UnitDataResponseSchema,
  UnitDataRowSchema,
  UnitDataSchema,
} from "./api/projects/[projectId]/jobs/[jobId]/units/schemas";
import { JobRulesSchema, JobResponseSchema, JobMetaResponseSchema } from "./api/projects/[projectId]/jobs/schemas";

import {
  CodebookNodeCreateSchema,
  CodebookNodeDataSchema,
  CodebookNodeResponseSchema,
} from "./api/projects/[projectId]/jobs/[jobId]/codebookNodes/schemas";
import { ProjectResponseSchema, ProjectsResponseSchema } from "./api/projects/schemas";

//////////  NEW
///////////
///////////
///////////
///////////

// DB TYPES
export interface ProjectConfig {
  description: string;
}
export interface JobsetAnnotatorStatistics {
  damage?: number;
  blocked?: boolean;
}
//

export const userRole = ["guest", "creator", "admin"] as const;
export type UserRole = (typeof userRole)[number];

export const projectRole = ["manager", "admin"] as const;
export type ProjectRole = (typeof projectRole)[number];

export const access = ["only_authenticated", "only_anonymous", "user_decides"] as const;
export type Access = (typeof access)[number];

export const codebookNodeType = [
  "Survey phase",
  "Survey group",
  "Annotation phase",
  "Annotation group",
  "Question",
  "Annotation task",
] as const;
export type CodebookNodeType = (typeof codebookNodeType)[number];

export type Phase = z.infer<typeof PhaseTypeSchema>;
export type TreeType = "root" | "phase" | "group" | "leaf";
export interface TypeDetails {
  phases: Phase[];
  treeType: TreeType;
}

export interface Authorization {
  email: string;
  role: UserRole | null;
  superAdmin?: boolean;
  projectId: number | null;
  projectRole: ProjectRole | null;
}

export type CodebookNodeData = z.infer<typeof CodebookNodeDataSchema>;
export type CodebookNodeCreate = z.infer<typeof CodebookNodeCreateSchema>;
export type CodebookNodeResponse = z.infer<typeof CodebookNodeResponseSchema>;
export type CodebookNode = CodebookNodeResponse & {
  parentPath: CodebookNodeResponse[];
  children: number[];
  treeType: TreeType;
  phase: Phase;
};

export type ProjectResponse = z.infer<typeof ProjectResponseSchema>;
export type Code = z.infer<typeof CodebookCodeSchema>;
export type VariableItem = z.infer<typeof CodebookVariableItemSchema>;
export type JobResponse = z.infer<typeof JobResponseSchema>;
export type Layout = z.infer<typeof UnitLayoutSchema>;
export type UnitData = z.infer<typeof UnitDataSchema>;
export type UnitDataResponse = z.infer<typeof UnitDataResponseSchema>;
export type Rules = z.infer<typeof JobRulesSchema>;

export type QuestionVariable = z.infer<typeof CodebookQuestionVariableSchema>;
export type AnnotationVariable = z.infer<typeof CodebookAnnotationVariableSchema>;
export type VariableSchema = QuestionVariable | AnnotationVariable;
export type CodebookVariable = VariableSchema & {
  name: string;
  layout?: Layout;
};

export interface CodebookPhase {
  type: Phase;
  variables: CodebookVariable[];
}

// TODO: We can probably remove all extended unit stuff now that we're making the content dynamic inside Document

export type GetUnit = z.infer<typeof GetUnitResponseSchema>;
export type Unit = GetUnit["unit"];
export type PhaseProgress = GetUnit["phaseProgress"];

export type GetUnitCache = Omit<GetUnit, "nTotal" | "nCoded" | "currentUnit">;
export type GetJobState = z.infer<typeof GetJobStateResponseSchema>;
export type Progress = z.infer<typeof AnnotateProgressSchema>;

// We compute the annotateProgress (i.e. the progress of units in annotation phase)
// server side, because we don't want to send all the unit data to the client.
// The other progress (i.e. the progress of survey phases) is computed client side,
// (because it has all the needed data and keeps being updated anyway)
export type JobState = Omit<GetJobState, "annotateProgress"> & {
  progress: Progress;
};

// !!!!!!!!!!!!!!!!!!!!!!!!! TODO: after refactor rename extendedcodebookphase to codebookphase,
// and extendedvariable to codebookphasevariable

export type ExtendedVariable = CodebookVariable & {
  // Adds some client side properties that are not stored in the backend
  name: string;
  layout?: Layout;
  codeMap: Record<string, Code>;
  validFrom?: ValidRelation;
  validTo?: ValidRelation;
};

export type ExtendedCodebookPhase = {
  id: number;
  label: string;
  type: Phase;
  variables: ExtendedVariable[];
};

export type AnnotationRelation = z.infer<typeof CodebookAnnotationRelationSchema>;

export type QuestionAnnotation = z.infer<typeof QuestionAnnotationSchema>;
export type SpanAnnotation = z.infer<typeof SpanAnnotationSchema>;
export type RelationAnnotation = z.infer<typeof RelationAnnotationSchema>;
export type Annotation = z.infer<typeof AnnotationSchema>;

export type QuestionAnnotationContext = z.infer<typeof QuestionAnnotationSchema>["context"];

export type JobserverCache = {
  unit: Record<number, { data: GetUnit["data"]; status: GetUnit["status"] }>;
  annotations: Record<number | "global", Annotation[]>;
};

export interface JobServer {
  jobId: number;
  userId: string;
  initialized: boolean;
  jobToken: string; // this token encodes the jobId and userId, and is included in postAnnotations to validate the request

  // We need to cache units by their phase and unit index, but cache annotations separately by the unit id.
  // otherwise, when updating the annotations for a unit in one phase, it wont affect the other
  // cache: JobserverCache;

  init: () => Promise<{ codebook: CodebookNode[]; jobState: GetJobState }>;
  getUnit: (phaseId: number, unitIndex?: number) => Promise<GetUnit | null>;
  postAnnotations: (
    unitToken: string | null, // for annotating units, include additional token (next to jobToken) for validating unit id
    add: AnnotationDictionary,
    rmIds: string[],
    status: Status,
  ) => Promise<Status>;
  getDebriefing?: () => Promise<Debriefing>;

  // These are the only parts inheriting classes need to implement
  getCodebook: () => Promise<CodebookNode[]>;
  getJobState: () => Promise<GetJobState>;
  // actual GetUnit and postAnnotations implementation

  previewMode?: boolean;
}

export type JobStateAnnotations = z.infer<typeof JobStateAnnotationsSchema>;

//
export type Status = "DONE" | "IN_PROGRESS";

///////////
///////////
///////////
///////////
///////////
///////////

// shorthand for the many setstate props being passed around
export type SetState<Type> = Dispatch<SetStateAction<Type>>;

// shorthand for the fullscreennode
export type FullScreenNode = MutableRefObject<HTMLDivElement | null>;

///// ANNOTATIONS
export type Span = z.infer<typeof SpanAnnotationSchema>["span"];
export type Edge = [number, number];

export type ServerUnitStatus = "DONE" | "IN_PROGRESS" | "PREALLOCATED" | "STOLEN";

// need to do this at some point but damn

// export interface GeneralTypeAnnotation {
//   id: string;
//   variable: string;
//   code: string | undefined;
//   value: string | number | undefined;

//   created: string;

//   color?: string;
//   comment?: string;

//   time_question?: string;
//   time_answer?: string;

//   // intermediate values (not stored in backend)
//   index?: number;
//   text?: string;
//   positions?: Set<number>;
//   span?: Span;

//   select?: () => void;
// }

// export interface SpanTypeAnnotation extends GeneralTypeAnnotation {
//   type: "span";
//   field: string;
//   offset: number;
//   length: number;
// }

// export interface FieldTypeAnnotation extends GeneralTypeAnnotation {
//   type: "field";
//   field: string;
//   id: string;
// }

// export interface UnitTypeAnnotation extends GeneralTypeAnnotation {
//   type: "unit";
//   id: string;
// }

// export interface RelationTypeAnnotation extends GeneralTypeAnnotation {
//   type: "relation";
//   id: string;
//   fromId: string;
//   toId: string;
// }

// export type Annotation = SpanTypeAnnotation | FieldTypeAnnotation | UnitTypeAnnotation | RelationTypeAnnotation;

// export interface Annotation {
//   type?: "field" | "span" | "relation";
//   id: string;
//   variable: string;
//   value?: string | number;
//   field?: string;

//   // span type annotations
//   offset?: number;
//   length?: number;
//   // relation type annotations
//   fromId?: string;
//   toId?: string;
//   // question type annotations
//   time_question?: string;
//   time_answer?: string;
//   // optional (?)
//   color?: string;
//   comment?: string;

//   // intermediate values (not stored in backend)
//   index?: number;
//   text?: string;
//   positions?: Set<number>;
//   span?: Span;

//   select?: () => void;
// }

// export interface RelationAnnotation {
//   type: "relation";
//   id: string;
//   variable: string;
//   value: string;
//   fromId: string;
//   toId: string;

//   // this stuff is just used internally
//   color?: string;
//   edge?: Edge;
//   from?: Annotation;
//   to?: Annotation;

//   select?: () => void;
// }

export type ProgressStatus = z.infer<typeof ProgressStatusSchema>;

export interface AnnotationLibrary {
  annotations: AnnotationDictionary;
  variables: ExtendedVariable[];
  variableIndex: number;
  variableStatuses: ProgressStatus[];
  byToken: TokenAnnotations;
  codeHistory: CodeHistory;
  previousIndex: number;
}
export type AnnotationDictionary = Record<AnnotationID, Annotation>;
export type TokenAnnotations = Record<number, AnnotationID[]>;
export type AnnotationID = string;

export interface AnnotationHistory {
  datetime: string;
  added: Annotation[];
  removed: Annotation[];
}

////// LOGIN

/**
 * An active session on a server. (should be hooked up to a react-query)
 */
export interface ActiveSession {
  /** A unique key for a session, consisting of user_id @ host */
  key: string;
  /** The url of a host server */
  host: string;
  /** A valid token for the host server */
  token: string;
}

/**
 * For keeping multiple sessions in local storage. Keys are "user_id @ host",
 * and the values are Session objects
 */
export interface Sessions {
  [token: string]: Session;
}

/** Information about a session */
export interface Session {
  host: string;
  user_id: number;
  token: string;
  email: string;
  name: string;
  restricted_job: number;
  restricted_job_label: string;
}

// export interface RelationAnnotations {
//   [from: string]: {
//     [to: string]: AnnotationMap;
//   };
// }

export interface Transition {
  direction?: "left" | "right" | "up";
  code?: Code;
}

export type QuestionType = "search code" | "select code" | "scale" | "annotinder" | "confirm" | "inputs";

export interface QuestionItem {
  name: string;
  label?: string;
  type?: QuestionItemType;
  min?: number;
  max?: number;
  rows?: number;
  optional?: boolean;
  autocomplete?: string;
  ref?: RefObject<HTMLElement | null>;
}

export type QuestionItemType = "email" | "number" | "textarea" | "text";

// an intermediate format that maps annotations to questions in 'questions' mode
export interface Answer {
  variable: string;
  items: AnswerItem[] | null;
  length?: number;
  field?: string;
  offset?: number;
  makes_irrelevant?: string[];
}

export interface AnswerItem {
  item: string;
  values: (string | number)[];
  optional?: boolean;
  invalid?: boolean;
  questionTime?: string;
  answerTime?: string;
}

/** Answer options used in 'questions' mode */
export interface AnswerOption {
  /** the code string */
  code: string;
  /** If the codebook is hierarchical, an array of all the code parents */
  /** The color (e.g., for button display) */
  color: string;
  /** If the options are rendered as buttons, the ref enables navigation */
  tree?: string[];
  /** An array with names of questions (or all "REMAINING" question) that become irrelevant if this options is chosen */
  makes_irrelevant?: string[];
  /** Like makes_irrelevant, but the questions become irrelevant if this option is NOT chosen */
  required_for?: string[];
  ref?: RefObject<HTMLElement | null>;
}

/** An object that maps an AnswerOption to left, right and up swipes */
export type Swipes = "left" | "right" | "up";
export interface SwipeOptions {
  left: Code;
  right: Code;
  up: Code;
}

/** the refs to html elements used in swipeControl */
export interface SwipeRefs {
  text: RefObject<HTMLElement | null>;
  box: RefObject<HTMLElement | null>;
  code: RefObject<HTMLElement | null>;
}

/** Used in AnswerField to manage answers given in the sub components */
export interface OnSelectParams {
  /** The answer given.  */
  value?: string | number | (string | number)[];
  /** The item for which the answer is given (if question has multiple items) */
  itemIndex?: number;
  /** Only relevant if value is not an array. If false, the answer values array (AnswerItem.values) will always be
   * of length 1 (which we treat as a scalar). If true, the answer values array can have zero or multiple
   * values, and the value now given will be toggled in/out of the array.
   */
  multiple?: boolean;
  /** If True, giving this answer immediately finishes the question (posts annotations and goes to next question or unit) */
  finish?: boolean;
  /** If True, the current answer is marked as invalid, and the user will not be able to continue (if the value is required) */
  invalid?: boolean;
  /** If True, post the annotations but without going to the next question/unit */
  save?: boolean;
  /** Optionally, transition parameters */
  transition?: Transition;
}

///// ANNOTATE MODE

// export interface Variable {
//   name: string;
//   type?: VariableType; // if missing, defaults to "span"
//   codes: Code[];
//   relations?: Relation[];
//   instruction: string;
//   buttonMode?: "all" | "recent";
//   searchBox?: boolean;
//   multiple?: boolean;
//   editMode?: boolean;
//   onlyImported?: boolean;
//   codeMap?: CodeMap;
//   validFrom?: ValidRelation;
//   validTo?: ValidRelation;
// }

export interface Relation {
  codes?: string[];
  from?: CodeRelation;
  to?: CodeRelation;
}

// for fast lookup of relation codes, indexed as: variable -> value -> relation_code_value -> relation_code_object
//export type ValidRelation = Record<string, Record<string, Record<string, Code>>>;

export interface ValidRelation {
  [variable: string]: {
    [value: string]: {
      [relationId: number]: Code[];
    };
  };
}

// for fast lookup of tokens in relation selection mode
export type ValidTokenRelations = Record<number, Record<string, Record<string, boolean>>>;
export type ValidTokenDestinations = Record<number, boolean>;

export type VariableType = "span" | "relation";

/** This one's intentionally flexible, because the codeselector popup handles multiple types of selections */
export interface CodeSelectorValue {
  id?: AnnotationID;
  annotation?: Annotation;
  variable?: string;
  span?: Span;
  value?: string | number | Code;
  code?: Code;
  relationOption?: RelationOption;
  delete?: boolean;
  cancel?: boolean;
}

export interface RelationOption {
  relations: Code[];
  from: Annotation;
  to: Annotation;
}

/** This one's intentionally flexible, because the codeselector popup handles multiple types of selections */
export interface CodeSelectorOption {
  /** The value returned by the dropbox/buttonselection */
  value: CodeSelectorValue;
  /** label shown in buttonselection */
  label?: string | number;
  /** color of button */
  color?: string;
  /** text shown as a tag attached to the button */
  tag?: string | number;
  /** used in buttons to set text color */
  textColor?: string;
  /** If the options are rendered as buttons, the ref enables navigation */
  ref?: RefObject<HTMLElement | null>;
  /** A string for looking up the option in text search */
  queryText?: string;
}

export interface CodeSelectorDropdownOption {
  /** Dropdown doesn't allow objects as values, so we use codes as values, and later find the full value */
  value: string;
  /** After getting the selected value, we can return the actual value object */
  fullvalue?: CodeSelectorValue;
  /** Used in dropdown for searching string match */
  text?: string;
  /** Used in dropdown to render label */
  content?: ReactElement<any>;
}

export type TokenSelection = [number, number | null] | [] | null;

/** used to manage keyboard navigation */
export interface Mover {
  position: number;
  startposition: number;
  ntokens: number;
  counter: number;
}

export type Arrowkeys = "ArrowRight" | "ArrowLeft" | "ArrowUp" | "ArrowDown" | null;

///// CONDITIONALS

export interface Conditional {
  /** The variable name */
  variable: string;
  /** Annotation values and (optionally) positions */
  conditions: Condition[];
  /** Action if conditions are successful */
  onSuccess?: "applaud";
  /** Action if conditions failed */
  onFail?: "retry" | "block";
  /** The damage to the coder's health if conditions failed. */
  damage?: number;
  /** A markdown string for a message to display if conditions failed */
  message?: string;
}

export interface Condition {
  /** The value to compare the annotation value to. See 'operator' for comparison */
  value: string | number;
  /** The operator to compare the annotation value to the gold value. Default is == */
  operator?: "==" | "<=" | "<" | ">=" | ">" | "!=";
  /** If given, annotation needs to have this field */
  field?: string;
  /** If given, annotation needs to have this offset */
  offset?: number;
  /** If given, annotation needs to have this length */
  length?: number;
  /** The damage to the coder's health if this specific condition failed. (adds to damage specified in Conditional) */
  damage?: number;
  /** An additional markdown string for a message to display if this specific condition failed.
   * These are below the Conditional message.
   */
  submessage?: string;
}

export interface ConditionReport {
  // A record where keys are variables and values are objects with results of conditions
  evaluation: { [key: string]: Action };
  damage: {
    damage?: number;
    game_over?: boolean;
    max_damage?: number;
  };
  reportSuccess?: boolean;
}

export interface Action {
  /** action to perform. This is determined based on the unit type and whether condition is satisfied.     */
  action?: ConditionalAction;
  /** Message to display */
  message?: string;
  submessages?: string[];
  correct?: Annotation[];
  incorrect?: Annotation[];
}

export type ConditionalAction = "retry" | "block" | "applaud";

///// JOBSERVER

export interface HostInfo {
  host?: string;
  oauthClients?: OauthClients;
  user?: HostUserInfo;
}

export interface HostUserInfo {
  user_id: number;
  name: string;
  email: string;
  is_admin: boolean;
  has_password: boolean;
  restricted_job: number;
  restricted_job_label: string;
}

export interface OauthClients {
  github?: { client_id: string };
}

///// UNIT DATA

export type UnitType = "annotation" | "survey";

/**
 * This function gets a unit from the server.
 * Use index -1 to tell the backend to decide what unit comes next  */
export type SetUnitIndex = (index: number) => void;

/** Units can have an object of variables, where keys are the variable names and values are pieces of text.
 *  These can be used in questions like: "is this text about [variable]"?.
 */
export interface UnitVariables {
  [key: string]: string | number | boolean;
}

/** A unit as it can be served by the backend.
 * Note that some parts (conditionals, damage) will normally not be visible to the frontend, but are included
 * here for jobserverdemo
 */
export interface RawUnit {
  status: UnitStatus;
  id: string; // this is the backend id, not the external id
  external_id?: string;
  unit: RawUnitContent;
  type: UnitType;
  conditionals?: Conditional[];
  damage?: number;
  report?: ConditionReport;
  annotations?: Annotation[];
  annotation?: Annotation[]; // deprecated in favor of plural 'annotations'
}

export interface RawUnitContent {
  text_fields?: ProcessedTextField[];
  tokens?: RawToken[] | RawTokenColumn;
  image_fields?: ProcessedImageField[];
  markdown_fields?: ProcessedMarkdownField[];
  meta_fields?: MetaField[];
  annotations?: Annotation[];
  codebook?: CodebookPhase;
  codebookId?: string;
  variables?: UnitVariables;
  grid?: FieldGridInput;
}

export interface FieldGridInput {
  areas: string[][];
  rows?: number[];
  columns?: number[];
}

export interface PreparedGrid {
  areas?: string;
  columns?: string;
  rows?: string;
}

export interface ProcessedField {
  name: string;
  value: string;
  grid_area?: string;
  style?: CSSProperties;
}

export interface ProcessedTextField extends ProcessedField {
  label?: string;
  offset?: number;
  unit_start?: number;
  unit_end?: number;
  context_before?: string;
  context_after?: string;
  paragraphs?: boolean;
}

export interface RenderedText {
  [key: string]: ReactElement<any>[];
}

export interface ProcessedImageField extends ProcessedField {
  alt?: string;
  base64?: boolean;
  caption?: string;
}

export interface RenderedImages {
  [key: string]: ReactElement<any>;
}

export interface ProcessedMarkdownField extends ProcessedField {}

export interface RenderedMarkdown {
  [key: string]: ReactElement<any>;
}

export interface MetaField {
  name: string;
  value: string | number;
  label: string;
  style?: CSSProperties;
}

///// CODES

// export interface Code {
//   variable: string;

//   code: string;
//   parent: string;
//   color: string;

//   // active: boolean;
//   // activeParent: any;
//   // folded: boolean;
//   // children: string[];
//   // foldToParent: any;
//   // totalChildren: number;
//   // totalActiveChildren: number;
//   // tree?: any;
//   /** An array with names of questions (or all "REMAINING" question) that become irrelevant if this options is chosen */
//   makes_irrelevant?: string[];
//   /** Like makes_irrelevant, but the questions become irrelevant if this option is NOT chosen */
//   required_for?: string[];
// }

export interface CodeRelation {
  variable: string;
  values?: string[];
}

export interface CodeMap {
  [key: string]: any;
}

export interface CodeTree {
  code: string;
  codeTrail: string[];
  [key: string]: any;
}

///// TOKENS

// token after parsing/preparing, as used in the annotator
export interface Token {
  field: string;
  paragraph: number;
  //sentence: number;
  index: number;
  offset: number;
  length: number;
  text: string;
  codingUnit: boolean;
  pre: string;
  post: string;
  containerRef?: any; // once rendered, a Token will carry refs for it's own element and it's container element
  ref?: any;
  arrayIndex?: number; // once rendered, the index of the rendered tokens. Can differ from 'index' if current unit is a subset of a document (so index does not start at 0)
}

// token as it can occur in a unit. This includes alternative conventions in NLP parsers
// that will be converted to Token format
export interface RawToken {
  field?: string;
  paragraph?: number;
  //sentence?: number;
  index?: number;
  offset?: number;
  length?: number;
  text?: string;
  codingUnit?: boolean;
  pre?: string;
  post?: string;
  annotations?: { name: string; value: string | number }[];
  token?: string;
  start?: number;
  end?: number;
  space?: string;
}

// raw token in column format.
export interface RawTokenColumn {
  field?: string[];
  paragraph?: number[];
  //sentence?: number[];
  index?: number[];
  text?: string[];
  token?: string[];
  offset?: number[];
  length?: number[];
  start?: number[];
  end?: number[];
  pre?: string[];
  post?: string[];
  space?: string[];
  codingUnit?: boolean[];
  annotations?: { name: string; value: string | number }[][];
}

////// DOCUMENT

export interface Doc {
  /** A processed version of a Unit, for use in the Document component */
  tokens: Token[];
  textFields: ProcessedTextField[];
  imageFields: ProcessedImageField[];
  markdownFields: ProcessedMarkdownField[];
  grid: PreparedGrid;
}

export interface DocumentSettings {
  editMode: boolean;
}

export interface FieldRefs {
  [field: string]: RefObject<HTMLElement | null>;
}

export interface VariableValueMap {
  /** Keys are variable names, values are objects in which keys are code-values, and their value is always true.
   *  Used for quick lookup of whether a value is allowed to be used for a given variable
   */
  [key: string]: {
    [key: string]: boolean;
  };
}

export interface CodeHistory {
  /** Keys are variable names, values are arrays of values that the variable has recently been coded with */
  [key: string]: (string | number)[];
}

export interface VariableMap {
  [key: string]: ExtendedVariable;
}

export interface TriggerSelectorParams {
  index?: number;
  from?: number;
  to?: number;
  fromId?: string;
  toId?: string;
}
export interface TriggerSelector {
  (params: TriggerSelectorParams): void;
}

///// FULLDATATABLE

export interface TableData {
  rows: RowObj[];
  page: number;
  pages: number;
}

/** An object where keys are column names and values their value for this particular row */
export interface RowObj {
  [key: string]: any;
}

export interface ButtonComponentProps {
  key: string;
  row: RowObj;
  setData: SetState<RowObj[]>;
  style: CSSProperties;
}

///// MANAGE USERS

///// MANAGE JOBS

export interface JobSettings {
  archived?: boolean;
  restricted?: boolean;
}

export interface JobAnnotation {
  jobset: string;
  unit_id: string;
  coder_id: number;
  coder: string;
  annotation: Annotation[];
  status: Status;
}

///// OTHER

export interface Debriefing {
  message?: string;
  link?: string;
  link_text?: string;
  /** The link can contain {user_id}, which will be replaced by the user_id from the backend
   *  This is mainly usefull for redirecting coders to a panel company, which can need their ID to pay them
   */
  user_id?: string;
  /** If True, show QR code for sharing the job with other people */
  qr?: boolean;
}

export interface SessionData {
  seenInstructions: Record<string, boolean>;
}
