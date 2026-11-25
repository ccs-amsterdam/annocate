import type { SpecialAnswer } from "@annotinder/contracts";
import { AddSpecialButton } from "../specialAnswers/AddSpecialButton";
import { SpecialAnswerRows } from "../specialAnswers/SpecialAnswerRows";
import { SPECIAL_GRID } from "../specialAnswers/specialAnswers";

/**
 * A question's special answers (docs/client.md §4) where there is no list of
 * options to put them under: nothing until one is added, then its row.
 */
export function SpecialAnswersFields({
  specials,
  onChange,
}: {
  specials: SpecialAnswer[] | undefined;
  onChange: (specials: SpecialAnswer[] | undefined) => void;
}) {
  const list = specials ?? [];
  return (
    <div className="flex flex-col gap-1.5">
      {list.length > 0 && (
        <div className={SPECIAL_GRID}>
          <SpecialAnswerRows specials={list} onChange={onChange} />
        </div>
      )}
      <div className="flex">
        <AddSpecialButton specials={list} onChange={onChange} />
      </div>
    </div>
  );
}
