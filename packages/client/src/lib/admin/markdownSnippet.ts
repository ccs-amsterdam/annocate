// The markdown toolbar's snippets (components/admin/MarkdownField.tsx) in a
// plain text area: `${TM_SELECTED_TEXT}` is the selection, `$0` where the
// cursor ends up (Monaco's snippet syntax, which the template editor takes).

/** Applies a toolbar snippet to a textarea's selection: the new text, and where the cursor goes. */
export function applySnippet(
  text: string,
  start: number,
  end: number,
  snippet: string,
  line: boolean,
): { text: string; cursor: number } {
  const selected = text.slice(start, end);
  // A heading or list item starts on its own line
  const before = line && start > 0 && text[start - 1] !== "\n" ? "\n" : "";
  const filled = before + snippet.replace("${TM_SELECTED_TEXT}", selected);
  const at = filled.indexOf("$0");
  const inserted = filled.replace("$0", "");
  return { text: text.slice(0, start) + inserted + text.slice(end), cursor: start + at };
}
