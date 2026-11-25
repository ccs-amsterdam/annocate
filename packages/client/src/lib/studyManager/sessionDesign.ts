import type {
  AnyVariableType,
  CoderTopLevelItem,
  CoderUnitLoopItem,
  DesignItem,
  EndItem,
  ReferenceScope,
  SessionResponse,
  TopLevelItem,
  UnitData,
  VariableValue,
} from "@annotinder/contracts";
import { buildScope, collectQuestions, itemName, loopDependencies, unitLoops } from "@annotinder/contracts";
import { findEnd } from "./items";

/**
 * The design a session codes with, as the server gave it (the coder
 * codebook: only what coding needs), and what StudyManager looks up in it.
 * Empty until the session is loaded.
 */
export class SessionDesign {
  private readonly items: CoderTopLevelItem[];
  /** Each unit loop's key (its id, contracts `unitLoops`): how the coder API and progress refer to it. */
  private readonly loopKeys: Map<CoderUnitLoopItem, string>;
  /** Every question in the codebook, for building `$var` scopes. */
  readonly questions: Map<string, AnyVariableType>;
  /** The coder-level ones (experiments too): what a coder-level answer can be for. */
  readonly coderQuestions: Map<string, AnyVariableType>;
  /** Per loop key, the coder-level questions it depends on (frozen once a unit there is saved). */
  private readonly dependencies: Map<string, string[]>;
  /** The session's `$session` values (the coder id, the design's URL parameters). */
  readonly session: Record<string, string>;

  constructor(session?: SessionResponse) {
    this.items = session?.codebook.items ?? [];
    this.loopKeys = new Map(unitLoops(this.items).map(({ key, loop }) => [loop, key]));
    this.dependencies = loopDependencies(this.items);
    const { questions, loopOf } = collectQuestions(this.items);
    this.questions = questions;
    this.coderQuestions = new Map([...questions].filter(([name]) => loopOf.get(name) === null));
    this.session = session?.session ?? {};
  }

  /**
   * The items for the step helpers shared with the editor (codebook/tree.ts),
   * typed as full design items: they only read item types, conditions,
   * questions and children, which the coder codebook keeps.
   */
  get stepItems(): TopLevelItem[] {
    return this.items as TopLevelItem[];
  }

  /** A loop's key (`loopKeys`). */
  keyOf(loop: CoderUnitLoopItem): string {
    return this.loopKeys.get(loop) ?? "";
  }

  /** The coder-level questions a loop depends on. */
  dependenciesOf(loopKey: string): string[] {
    return this.dependencies.get(loopKey) ?? [];
  }

  /** A top-level step by which it is known as reached (`Position`): a loop by its key, another item by its name. */
  topStepKey(step: DesignItem): string {
    return step.type === "unit_loop" ? `loop:${this.keyOf(step as CoderUnitLoopItem)}` : `item:${itemName(step) ?? ""}`;
  }

  /** The `end` item with this name; null if the design no longer has it. */
  findEnd(name: string): EndItem | null {
    return findEnd(this.stepItems, name);
  }

  /** The scope for scripts and templates: answers, the unit's data, and the session's values. */
  scope(answers: Record<string, VariableValue>, unit?: UnitData | null): ReferenceScope {
    return buildScope(this.questions, answers, unit, this.session);
  }
}
