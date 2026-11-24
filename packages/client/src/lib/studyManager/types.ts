import type {
  AnyVariableType,
  CoderUnitResponse,
  DesignItem,
  Display,
  EndItem,
  Reopen,
  UnitLayout,
  VariableValue,
} from "@annotinder/contracts";
import type { RenderedTemplate } from "../codebook/renderTemplate";
import type { QuestionTexts } from "../components/Question";

// What StudyManager publishes to the coding screen (docs/client.md §2 "StudyManager").

export type StudyManagerPhase = "loading" | "user_variable" | "unit_variable" | "finished" | "error";

export interface NavigationUnitItem {
  index: number;
  id: number;
  externalId: string;
  isCurrent: boolean;
}

export interface NavigationUnitQuestion {
  index: number;
  name: string;
  label: string;
  isCurrent: boolean;
  isCompleted: boolean;
}

/** A top-level step of the study, for the navigation menu. */
export interface NavigationPhase {
  index: number;
  name: string;
  type: "unit_loop" | "branch" | "question" | "end";
  label: string;
  isCurrent: boolean;
  isCompleted: boolean;
  unitCount?: number;
  /** Units this coder will get in the loop, if known (from the server). */
  totalUnits?: number;
  currentUnitIndex?: number;
  units?: NavigationUnitItem[];
  questions?: NavigationUnitQuestion[];
  /** A loop's questions in the codebook (also those a condition may skip). */
  questionCount?: number;
}

export interface StudyManagerNavigation {
  canGoBack: boolean;
  canGoForward: boolean;
  phases: NavigationPhase[];
  currentPhaseIndex: number;
  currentUnitIndex?: number;
  totalUnitsInHistory: number;
  maxReachedTopIndex: number;
}

/** How the session ended at an `end` item: its message and redirect, with their values filled in. */
export interface SessionEnding {
  item: EndItem;
  message: RenderedTemplate | null;
  redirectUrl: string | null;
}

export interface StudyManagerSnapshot {
  phase: StudyManagerPhase;
  currentItem: DesignItem | null;
  currentUnit: CoderUnitResponse | null;
  currentUnitLayout: UnitLayout | null;
  /** In a unit loop: its questions by name (a relation question shows the spans of others). */
  currentLoopVariables: ReadonlyMap<string, AnyVariableType> | null;
  /** The layout's template with its values evaluated for the current unit. */
  currentUnitTemplate: RenderedTemplate | null;
  /** The current question's texts with their values evaluated. */
  currentTexts: QuestionTexts | null;
  /** The current coder-level question's answer can't change any more: units were coded with it (contracts `loopDependencies`). */
  currentFrozen: boolean;
  userVariableValues: Record<string, VariableValue>;
  currentUnitVariables: Record<string, VariableValue> | null;
  error: string | null;
  /** Machine-readable error code from the server (e.g. `coder_has_session`), if any. */
  errorCode: string | null;
  /**
   * With phase `error`: the finished unit whose answers the server refused
   * (400). Besides `retry()`, the coder can go back to it and answer again
   * (`backToRefusedUnit()`).
   */
  refusedUnit: { loop: string; unitId: number } | null;
  /** With phase `finished`: the `end` item that ended the session, if one did. */
  ending: SessionEnding | null;
  /** With phase `finished`: the coder quit (`quit`). */
  quit: boolean;
  /** The coder asked for their answers to be deleted (`quit(true)`, also after the session ended). */
  deletionRequested: boolean;
  /** The email the coder is logged in with (their session is found by it on any device); null without. */
  login: string | null;
  /** The link lets the coder log in, and they haven't. */
  canLogIn: boolean;
  /** With phase `finished`: whether the coder can go back (`reopen()`); `until` null: always. */
  reopen: Reopen;
  /** The coder got new units since they were last here: the study's message for it, until dismissed (`dismissNewUnits()`). */
  newUnits: string | null;
  /** Answers not saved on the server yet (they are sent in the background, `save`). */
  unsaved: number;
  /** Saving failed for lack of a connection (or a server hiccup): it is tried again. */
  retrying: boolean;
  navigation: StudyManagerNavigation;
  /**
   * A practice question answered wrongly (docs/architecture.md §6.2): the
   * feedback, shown with the question. With `retry` the coder answers again
   * until right; without, they may go on (`continueAfterPractice`).
   */
  practiceWrong: { question: string; messages: RenderedTemplate[]; retry: boolean } | null;
  /** Practice questions answered right so far: the coding screen flashes a check when it goes up. */
  practiceRight: number;
  /** The study's public title (the design's `public.title`), null without one. */
  title: string | null;
  /** How the coding screen looks (the Study entry's `display`): layouts and theme. */
  display: Display;
}

export type StudyManagerListener = () => void;
