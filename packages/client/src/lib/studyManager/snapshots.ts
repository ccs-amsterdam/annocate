import type { StudyManagerSnapshot } from "./types";

/** No step on screen: nothing of a question or a unit. */
export const NO_STEP = {
  currentItem: null,
  currentUnit: null,
  currentUnitLayout: null,
  currentLoopVariables: null,
  currentUnitTemplate: null,
  currentTexts: null,
  currentUnitVariables: null,
} satisfies Partial<StudyManagerSnapshot>;

/** What StudyManager publishes before the session is loaded. */
export const INITIAL_SNAPSHOT: StudyManagerSnapshot = {
  ...NO_STEP,
  phase: "loading",
  userVariableValues: {},
  error: null,
  errorCode: null,
  refusedUnit: null,
  ending: null,
  quit: false,
  deletionRequested: false,
  currentFrozen: false,
  login: null,
  canLogIn: false,
  signIn: "none",
  reopen: null,
  newUnits: null,
  unsaved: 0,
  unsavedUnits: 0,
  retrying: false,
  practiceWrong: null,
  practiceRight: 0,
  title: null,
  display: {},
  navigation: {
    canGoBack: false,
    canGoForward: false,
    phases: [],
    currentPhaseIndex: 0,
    maxReachedTopIndex: 0,
  },
};
