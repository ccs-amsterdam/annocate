import type { CoderUnitResponse } from "@annotinder/contracts";
import type { CoderApi } from "../api/httpCoderApi";
import type { Outbox } from "./outbox";

/** Units fetched at once, and how few may be left before more are fetched. */
const UNIT_BATCH = 5;
const UNIT_REFILL = 2;

/**
 * A loop's units fetched ahead (a batch), not shown yet, and every unit the
 * queue ever held (`seen`): the server lists unfinished units first, so a
 * unit handed out but not finished yet comes back in the next batch and
 * must not be queued again.
 */
interface Queue {
  units: CoderUnitResponse[];
  filling: Promise<void> | null;
  seen: Set<number>;
}

/**
 * The coder's next units, per loop (by its key). Units come in batches,
 * fetched again in the background before the batch runs out, so the coder
 * doesn't wait.
 */
export class UnitQueues {
  private queues = new Map<string, Queue>();

  constructor(
    private readonly coderApi: Pick<CoderApi, "getNextUnits">,
    private readonly outbox: Outbox,
  ) {}

  /**
   * The coder's next unit in a loop, or null when they are done with it.
   * `has`: the units the coder already has (in the loop's history).
   */
  async next(loopKey: string, has: (unitId: number) => boolean): Promise<CoderUnitResponse | null> {
    const queue = this.queue(loopKey);
    if (queue.units.length === 0) await this.fill(loopKey, has);
    // Units answered but not saved yet came back (the server doesn't know
    // they are done): once saved, it knows what is next.
    if (queue.units.length === 0 && this.outbox.waiting.some((item) => item.unit?.loop === loopKey)) {
      await this.outbox.flush();
      await this.fill(loopKey, has);
    }
    const unit = queue.units.shift() ?? null;
    if (unit && queue.units.length < UNIT_REFILL) this.fill(loopKey, has).catch(() => {}); // tried again when needed
    return unit;
  }

  /** Drops what was fetched ahead (a new design version: the units are served again). */
  clear(): void {
    this.queues.clear();
  }

  private queue(loopKey: string): Queue {
    let queue = this.queues.get(loopKey);
    if (!queue) this.queues.set(loopKey, (queue = { units: [], filling: null, seen: new Set<number>() }));
    return queue;
  }

  /** Asks the server for the coder's next units; adds those the coder doesn't have yet. */
  private fill(loopKey: string, has: (unitId: number) => boolean): Promise<void> {
    const queue = this.queue(loopKey);
    queue.filling ??= (async () => {
      try {
        const units = await this.coderApi.getNextUnits(loopKey, UNIT_BATCH);
        const fresh = units.filter((u) => !has(u.id) && !queue.seen.has(u.id));
        for (const u of fresh) queue.seen.add(u.id);
        queue.units.push(...fresh);
      } finally {
        queue.filling = null;
      }
    })();
    return queue.filling;
  }
}
