type Operation = () => Promise<void>;

/** What the operations need of the session they run on. */
export interface OperationHooks<Place> {
  /** Where the coder is: what a failed operation puts back, so that they are on the step they see. */
  place(): Place;
  restore(place: Place): void;
  /** Shows the step the coder is on again (before repeating what failed). */
  republish(): Promise<void>;
  /** The session ended meanwhile: what was underway doesn't matter. */
  ended(): boolean;
  /** An operation failed, and the coder is back where they were; `repeat` is what `retry` should do. */
  failed(err: unknown, repeat: Operation): Promise<void>;
  /** An operation is done (and didn't fail). */
  done(): void;
}

/**
 * The operations that talk to the server (answering, navigating). They run
 * one at a time, in the order they came (a double click, a fast swipe, back
 * pressed while an answer is handled): each starts from where the one
 * before left the coder. A failure leaves the coder where they were, and is
 * reported with what to repeat: the operation, or its part still to do
 * (`retryFrom`).
 */
export class Operations<Place> {
  /** The end of the line of operations: each starts when the one before is done. */
  private turn: Promise<void> = Promise.resolve();
  /** Operations running. */
  private busy = 0;
  /** What fails with the operation now running: all of it, or its part still to do (`retryFrom`). */
  private failing: Operation = async () => {};
  /** What `retry` repeats: set when something failed, until it is retried. */
  private toRepeat: Operation | null = null;

  constructor(private readonly hooks: OperationHooks<Place>) {}

  /** Whether an operation is running (it meets a failed background save itself). */
  get running(): boolean {
    return this.busy > 0;
  }

  /** Runs an operation in its turn. `afterError`: the step the coder was on is shown again first. */
  guarded(operation: Operation, afterError = false): Promise<void> {
    const run = this.turn.then(() => this.run(operation, afterError));
    this.turn = run.catch(() => {});
    return run;
  }

  private async run(operation: Operation, afterError: boolean): Promise<void> {
    const before = this.hooks.place();
    this.failing = operation;
    this.busy += 1;
    try {
      if (afterError) await this.hooks.republish();
      await operation();
    } catch (err) {
      if (this.hooks.ended()) return;
      this.hooks.restore(before);
      await this.hooks.failed(err, this.failing);
      return;
    } finally {
      this.busy -= 1;
    }
    this.hooks.done();
  }

  /**
   * Runs the rest of an operation, `step`: if it fails, retrying repeats
   * only this. What the operation did before (an answer kept, a save queued)
   * is done, and isn't done again.
   */
  retryFrom(step: Operation): Promise<void> {
    this.failing = step;
    return step();
  }

  /** Something failed: what retrying repeats (null: nothing any more). */
  repeatOnRetry(repeat: Operation | null): void {
    this.toRepeat = repeat;
  }

  /** What to repeat now (with `guarded`, after the error): given once. Null: nothing failed. */
  takeRepeat(): Operation | null {
    const repeat = this.toRepeat;
    this.toRepeat = null;
    return repeat;
  }
}
