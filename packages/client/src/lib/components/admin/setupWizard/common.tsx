import type { ReactNode } from "react";
import type { SetupAnswers } from "../../../admin/setupRecipe";

/** What every step gets: the answers so far, and a way to change them. */
export interface StepProps {
  answers: SetupAnswers;
  set: (patch: Partial<SetupAnswers>) => void;
}

/** A step's explanation, above its fields. */
export function Intro({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
