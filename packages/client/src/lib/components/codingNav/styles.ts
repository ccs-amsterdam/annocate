import { cn } from "cn";

/** A button on the coding screen's top bar. */
export const barButton =
  "flex h-8 cursor-pointer items-center justify-center rounded-lg text-bar-foreground transition-colors hover:bg-bar-foreground/15";

/** A row of a menu's list (a step, a question): the current one stands out. */
export const rowClass = (current: boolean) =>
  cn(
    "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
    current ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-muted/60",
  );
