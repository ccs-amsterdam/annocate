import type { CoderUnitResponse, DesignItem } from "@annotinder/contracts";

/** Which instructions open by themselves (a question's `instructionOpen`), for one visit. */
export class InstructionOpening {
  /** The unit a loop question first came up on, by `<loop>/<question>`. */
  private shownOn = new Map<string, number>();

  /**
   * Whether a question's instruction opens by itself on this unit: `first`,
   * on the first unit the coder answers it on (also after a reload: not once
   * they finished units in the loop, `doneUnitIds`); `practice`, on practice
   * units.
   */
  opens(item: DesignItem, loopKey: string, unit: CoderUnitResponse, doneUnitIds: number[]): boolean {
    const open = "instructionOpen" in item ? item.instructionOpen : undefined;
    if (!open) return false;
    if (open === "practice") return unit.data?.test_set === "practice";
    const key = `${loopKey}/${"name" in item ? item.name : ""}`;
    const shownOn = this.shownOn.get(key);
    if (shownOn !== undefined) return shownOn === unit.id;
    if (doneUnitIds.some((id) => id !== unit.id)) return false;
    this.shownOn.set(key, unit.id);
    return true;
  }
}
