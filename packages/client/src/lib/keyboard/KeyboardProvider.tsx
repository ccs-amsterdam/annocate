import { useEffect, useMemo, type ReactNode } from "react";
import { KeyController } from "./controller";
import { keyDownHandler } from "./keyDown";
import { setLeader } from "./leader";
import { KeyboardContext } from "./context";
import { mappingById, type KeyMapping } from "./mappings";
import { useCoderSettings } from "../context/coderSettings";

/**
 * The coding screen's keyboard (docs/client.md §4 "Keyboard"): listens once,
 * on window, and offers each key press to the scopes fields and menus add
 * (hooks.ts). Typing in a text field is the field's; a held-down key chooses
 * once (keyDown.ts). Without a provider (e.g. the editor's previews) the
 * hooks do nothing.
 */
export function KeyboardProvider({ children, mapping: given }: { children: ReactNode; mapping?: KeyMapping }) {
  // The coder's choice (their settings), unless given
  const { keyMapping } = useCoderSettings();
  const mapping = given ?? mappingById(keyMapping);
  const controller = useMemo(() => new KeyController(), []);
  useEffect(() => {
    const onKeyDown = keyDownHandler(controller);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      setLeader(false);
    };
  }, [controller]);
  const value = useMemo(() => ({ controller, mapping }), [controller, mapping]);
  return <KeyboardContext.Provider value={value}>{children}</KeyboardContext.Provider>;
}
