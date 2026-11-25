import type {
  CoderUnitLoopItem,
  CoderUnitResponse,
  DesignItem,
  LayoutItem,
  VariableValue,
} from "@annotinder/contracts";

/** The unit the coder is in: its questions as its answers show them, and which one they are on. */
export interface OpenUnit {
  unit: CoderUnitResponse;
  /** The unit's steps (conditions applied); none until they are worked out for it. */
  steps: DesignItem[];
  /** The layout each step shows the unit with (the last layout item passed; null: no unit). */
  layouts: (LayoutItem | null)[];
  index: number;
  answers: Record<string, VariableValue>;
  /** The coder-level answers shown, plus this unit's answers to questions that are currently shown. */
  visible: Record<string, VariableValue>;
}

/** A place to go back to (`Position.save`). */
export interface SavedPosition {
  topSteps: DesignItem[];
  topIndex: number;
  reached: Set<string>;
  coderVisible: Record<string, VariableValue>;
  activeLoop: CoderUnitLoopItem | null;
  unit: OpenUnit | null;
}

/**
 * Where the coder is: the top-level steps and the one they are on, how far
 * they got, and inside a loop the unit they are in.
 */
export class Position {
  topSteps: DesignItem[] = [];
  topIndex = -1;
  /** Answers of coder-level questions that are currently shown (hidden ones count as unanswered). */
  coderVisible: Record<string, VariableValue> = {};
  activeLoop: CoderUnitLoopItem | null = null;
  /** In a loop: the unit the coder is in; null between units. */
  unit: OpenUnit | null = null;
  /**
   * The top-level steps the coder got to (by `stepKey`), and the last of
   * them in `topSteps`: how far Next goes. Kept by step, not by index: a
   * changed answer can hide steps before it.
   */
  private reached = new Set<string>();
  private furthest = 0;

  constructor(private readonly stepKey: (step: DesignItem) => string) {}

  /** The last top-level step the coder got to. */
  get maxReachedTopIndex(): number {
    return this.furthest;
  }

  /** Before the first step, as when a session starts. */
  restart(): void {
    this.topIndex = -1;
    this.reached.clear();
    this.furthest = 0;
    this.leaveLoop();
  }

  setTopSteps(steps: DesignItem[], visible: Record<string, VariableValue>): void {
    this.topSteps = steps;
    this.coderVisible = visible;
    this.setFurthest();
  }

  /** The coder got to a top-level step. */
  reachTopStep(index: number): void {
    const step = this.topSteps[index];
    if (step) this.reached.add(this.stepKey(step));
    this.setFurthest();
  }

  private setFurthest(): void {
    const last = this.topSteps.findLastIndex((step) => this.reached.has(this.stepKey(step)));
    this.furthest = Math.max(0, last);
  }

  /** A unit of the loop becomes the one the coder is in (its steps follow). */
  openUnit(unit: CoderUnitResponse, answers: Record<string, VariableValue>): OpenUnit {
    this.unit = { unit, answers, steps: [], layouts: [], index: -1, visible: {} };
    return this.unit;
  }

  /** Not in a loop any more: nothing of its unit stays (navigation reads these). */
  leaveLoop(): void {
    this.activeLoop = null;
    this.unit = null;
  }

  /** What a failed operation puts back (`restore`), so that the coder is on the step they see. */
  save(): SavedPosition {
    return {
      topSteps: this.topSteps,
      topIndex: this.topIndex,
      reached: new Set(this.reached),
      coderVisible: this.coderVisible,
      activeLoop: this.activeLoop,
      // (The answers stay the unit's own: an answer given in a failed operation is kept)
      unit: this.unit && { ...this.unit },
    };
  }

  restore(saved: SavedPosition): void {
    Object.assign(this, saved);
    this.setFurthest();
  }
}

/** A unit's last question (not an `end` item its answers lead to); 0 if none. */
export function lastQuestionIndex(steps: DesignItem[]): number {
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i].type !== "end") return i;
  return 0;
}
