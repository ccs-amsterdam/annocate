import { useEffect, useMemo, type ReactNode } from "react";
import { KeyController, inTextField } from "./controller";
import { KeyboardContext } from "./context";
import { numbersMapping, type KeyMapping } from "./mappings";

/** Whether a key's target is a control the browser activates with Space or Enter. */
function activates(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest("button, [role=radio], [role=button], a[href]");
}

/**
 * The coding screen's keyboard (docs/client.md §5 "Keyboard"): listens once,
 * on window, and offers each key press to the scopes fields and menus add
 * (hooks.ts). Typing in a text field is the field's; a held-down key chooses
 * once. Without a provider (e.g. the editor's previews) the hooks do nothing.
 */
export function KeyboardProvider({
  children,
  mapping = numbersMapping,
}: {
  children: ReactNode;
  mapping?: KeyMapping;
}) {
  const controller = useMemo(() => new KeyController(), []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || inTextField(event.target)) return;
      // Space and Enter on a focused button choose it (the browser clicks it)
      if ((event.key === " " || event.key === "Enter") && activates(event.target)) return;
      if (event.repeat) {
        event.preventDefault();
        return;
      }
      if (controller.dispatch(event)) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [controller]);
  const value = useMemo(() => ({ controller, mapping }), [controller, mapping]);
  return <KeyboardContext.Provider value={value}>{children}</KeyboardContext.Provider>;
}
