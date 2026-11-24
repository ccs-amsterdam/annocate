import { CoderSettingsProvider } from "../context/CoderSettingsContext";
import { KeyboardProvider } from "../keyboard/KeyboardProvider";
import { CoderSessionGate } from "./studyRunner/CoderSessionGate";
import type { StudyRunnerProps } from "./studyRunner/types";

/**
 * The coding screen (docs/client.md §2): runs a coder's session against the
 * server and shows the current step, driven by `StudyManager`.
 */
export function StudyRunner(props: StudyRunnerProps) {
  return (
    // A coder's own settings follow their login (not in previews): the API without the deployment
    <CoderSettingsProvider accountUrl={props.preview ? undefined : props.baseUrl.replace(/\/d\/[^/]+\/?$/, "")}>
      <KeyboardProvider>
        <CoderSessionGate {...props} />
      </KeyboardProvider>
    </CoderSettingsProvider>
  );
}
