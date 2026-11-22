import { useState } from "react";

/** Copies text to the clipboard; `copied` is true for a moment after, to say so. */
export function useCopied(): { copied: boolean; copy: (text: string) => Promise<void> } {
  const [copied, setCopied] = useState(false);
  return {
    copied,
    copy: async (text) => {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    },
  };
}
