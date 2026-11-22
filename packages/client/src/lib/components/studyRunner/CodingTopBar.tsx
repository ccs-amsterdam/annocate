import { CloudOff } from "lucide-react";
import type { CoderApi } from "../../api/httpCoderApi";
import type { StudyManager } from "../../studyManager/StudyManager";
import type { StudyManagerSnapshot } from "../../studyManager/types";
import { CodingNav, CodingProgress } from "../CodingNav";
import { QuitMenu } from "../QuitMenu";
import { CoderSettingsMenu } from "./CoderSettingsMenu";
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
        {snapshot.retrying && (
          <span
            className="flex items-center gap-1 text-xs"
            role="status"
            title="Your answers are kept and saved as soon as the connection is back."
          >
            <CloudOff className="h-4 w-4" />
            <span className="hidden sm:inline">Not saved yet: no connection</span>
          </span>
        )}
        {!preview && (
          <TransferMenu
            coderApi={coderApi}
            transferUrl={transferUrl}
            login={snapshot.login}
            canLogIn={snapshot.canLogIn}
          />
        )}
        <CoderSettingsMenu />
        <QuitMenu
          onQuit={(requestDeletion) => manager.quit(requestDeletion)}
          canTransfer={!preview && !!coderApi.createTransfer}
          login={snapshot.login}
        />
      </div>
    </header>
  );
}
