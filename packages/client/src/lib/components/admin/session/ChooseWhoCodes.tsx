import { sessionItem, type DesignItem } from "@annotinder/contracts";
import { getItemKey } from "../designTree/utils";
import type { DesignDraft } from "../designEditor/useDesignDraft";
import { useSessionTab } from "./sessionTab";
import { WhoCodesCards } from "./WhoCodesCards";
import { firstInvite } from "./whoCodes";
import { openGuide } from "../guide/guideStore";

/**
 * Before who codes is chosen (needed to deploy, contracts `deployErrors`),
 * the design page is only this: the two ways, explained. Choosing one opens
 * the editor on its form.
 */
export function ChooseWhoCodes({ draft }: { draft: DesignDraft }) {
  const [, setTab] = useSessionTab();
  const session = sessionItem(draft.items)!;
  const key = getItemKey(session as DesignItem);
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
      <div className="flex w-full max-w-3xl flex-col gap-4">
        <div className="text-center">
          <h2 className="font-heading text-2xl font-semibold">Who codes?</h2>
          <p className="text-sm text-muted-foreground">
            The first choice for a study: it decides how coders get in and how units are handed out. You can change it
            later.
          </p>
        </div>
        <WhoCodesCards
          value={null}
          long
          learnMore={() => openGuide("Design", "modes")}
          onChoose={(mode) => {
            draft.update(key, { ...session, invite: firstInvite(mode) });
            setTab("invite");
            draft.select(key);
          }}
        />
      </div>
    </div>
  );
}
