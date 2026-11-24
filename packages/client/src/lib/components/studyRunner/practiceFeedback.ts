import type { StudyManagerSnapshot } from "../../studyManager/types";

type PracticeWrong = NonNullable<StudyManagerSnapshot["practiceWrong"]>;

/**
 * The feedback on a wrong practice answer to show with a question: only for
 * the question of the unit it was given to (the next unit's question of the
 * same name has none).
 */
export function practiceFeedback(
  snapshot: Pick<StudyManagerSnapshot, "practiceWrong" | "currentUnit">,
  question: string,
): PracticeWrong | null {
  const wrong = snapshot.practiceWrong;
  if (!wrong || wrong.question !== question || wrong.unitId !== snapshot.currentUnit?.id) return null;
  return wrong;
}
