import { ReopenSetting } from "../session/ReopenSetting";
import { NewUnitsMessage } from "./UnitsToDeploy";

/** What the first deploy asks: what happens when coders finish, and what coders who later get new units are told. */
export function FirstDeploySettings({
  reopenMinutes,
  onReopenMinutesChange,
  newUnitsMessage,
  onNewUnitsMessageChange,
}: {
  reopenMinutes: number | null;
  onReopenMinutesChange: (minutes: number | null) => void;
  newUnitsMessage: string;
  onNewUnitsMessageChange: (message: string) => void;
}) {
  return (
    <section className="space-y-3 rounded-md border border-border p-3">
      <p className="font-semibold text-foreground">Before coders start</p>
      <ReopenSetting value={reopenMinutes} onChange={onReopenMinutesChange} name="first-deploy-reopen" />
      <NewUnitsMessage value={newUnitsMessage} onChange={onNewUnitsMessageChange} />
      <p className="text-xs text-muted-foreground">
        You can change these later in the study&apos;s Settings and when you deploy.
      </p>
    </section>
  );
}
