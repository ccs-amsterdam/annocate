import type { CoderApi } from "../../api/httpCoderApi";
import type { StudyManager } from "../../studyManager/StudyManager";
import type { StudyManagerSnapshot } from "../../studyManager/types";
import { CodingNav } from "../CodingNav";
import { CodingProgress } from "../codingNav/CodingProgress";
import { QuitMenu } from "../QuitMenu";
import { CoderSettingsMenu } from "./CoderSettingsMenu";
import { UnsavedNotice } from "./ConnectionNotices";
import { KeyboardMenu } from "./KeyboardMenu";
import { TransferMenu } from "./TransferMenu";

/**
 * The coding screen's top bar: navigation and progress on the left
 * (`CodingNav`); on the right whether saving waits for a connection, and
 * the menus to continue elsewhere, for settings and to stop.
 */
export function CodingTopBar({
  snapshot,
  manager,
  coderApi,
  transferUrl,
  preview,
  onBack,
  onForward,
}: {
  snapshot: StudyManagerSnapshot;
  manager: StudyManager;
  coderApi: CoderApi;
  transferUrl: (token: string) => string;
  preview?: boolean;
  onBack: () => void;
  onForward: () => void;
}) {
  return (
    <header className="relative flex h-11 shrink-0 items-center justify-between border-b border-bar-foreground/10 bg-bar px-3 text-bar-foreground shadow-sm sm:px-4">
      <CodingProgress navigation={snapshot.navigation} />
      <CodingNav
        navigation={snapshot.navigation}
        title={snapshot.title}
        onJumpToPhase={(index) => void manager.jumpToPhase(index)}
        onJumpToUnit={(index) => void manager.jumpToUnit(index)}
        onJumpToQuestion={(index) => void manager.jumpToLoopStep(index)}
        onBack={onBack}
        onForward={onForward}
      />
      <div className="flex shrink-0 items-center gap-1">
        {snapshot.retrying && <UnsavedNotice unsavedUnits={snapshot.unsavedUnits} />}
        {!preview && (
          <TransferMenu
            coderApi={coderApi}
            transferUrl={transferUrl}
            login={snapshot.login}
            canLogIn={snapshot.canLogIn}
          />
        )}
        <KeyboardMenu />
        <CoderSettingsMenu />
        <QuitMenu
          onQuit={(requestDeletion) => manager.quit(requestDeletion)}
          canTransfer={!preview && !!coderApi.createTransfer}
          login={snapshot.login}
          waitingForConnection={snapshot.retrying}
        />
      </div>
    </header>
  );
}
