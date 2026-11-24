import { useRef, useState, type ReactNode } from "react";
import { Bold, Heading2, Italic, Link, List, ListOrdered, Maximize2, Minimize2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";
import { applySnippet } from "../../admin/markdownSnippet";

/**
 * Markdown formatting, as snippets: `${TM_SELECTED_TEXT}` is the selection
 * it wraps, `$0` where the cursor ends up (Monaco's snippet syntax, so the
 * template editor takes them as they are). A `line` one starts a line.
 */
const ACTIONS = [
  { label: "Bold", icon: Bold, snippet: "**${TM_SELECTED_TEXT}$0**" },
  { label: "Italic", icon: Italic, snippet: "_${TM_SELECTED_TEXT}$0_" },
  { label: "Heading", icon: Heading2, snippet: "## ${TM_SELECTED_TEXT}$0", line: true },
  { label: "List", icon: List, snippet: "- ${TM_SELECTED_TEXT}$0", line: true },
  { label: "Numbered list", icon: ListOrdered, snippet: "1. ${TM_SELECTED_TEXT}$0", line: true },
  { label: "Link", icon: Link, snippet: "[${TM_SELECTED_TEXT}](https://$0)" },
] as const;

/**
 * A row of small buttons for common markdown (bold, italic, a heading,
 * lists, a link), applied by `insert` to the selection; `children`: more
 * on its right (the template's Insert menu).
 */
export function MarkdownToolbar({
  insert,
  children,
  className,
}: {
  insert: (snippet: string, line: boolean) => void;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-0.5", className)} role="toolbar" aria-label="Formatting">
      {ACTIONS.map(({ label, icon: Icon, snippet, ...a }) => (
        <button
          key={label}
          type="button"
          title={label}
          aria-label={label}
          // Keeps the text's selection
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insert(snippet, "line" in a && a.line)}
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
      {children && <div className="ml-auto">{children}</div>}
    </div>
  );
}

/**
 * A markdown text (a question, an instruction): one line by default, with
 * a button to make it a text area with the formatting toolbar; a text of
 * several lines opens as the text area. `area`: always the text area.
 */
export function MarkdownField({
  value,
  onChange,
  placeholder,
  area = false,
  label,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  area?: boolean;
  /** For screen readers (the visible label is the form's). */
  label: string;
  autoFocus?: boolean;
}) {
  const [expanded, setExpanded] = useState(() => area || value.includes("\n"));
  const textarea = useRef<HTMLTextAreaElement>(null);
  const multiline = area || expanded || value.includes("\n");

  const insert = (snippet: string, line: boolean) => {
    const el = textarea.current;
    if (!el) return;
    const next = applySnippet(value, el.selectionStart, el.selectionEnd, snippet, line);
    onChange(next.text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.cursor, next.cursor);
    });
  };

  if (!multiline)
    return (
      <div className="flex items-center gap-1">
        <Input
          aria-label={label}
          value={value}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          title="More lines, with formatting"
          aria-label="Write more lines"
          onClick={() => setExpanded(true)}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>
    );

  return (
    <div className="flex flex-col rounded-md border border-input focus-within:ring-1 focus-within:ring-ring">
      <div className="flex items-center border-b border-input/70 px-1 py-0.5">
        <MarkdownToolbar insert={insert} className="flex-1" />
        {!area && !value.includes("\n") && (
          <button
            type="button"
            title="One line"
            aria-label="Back to one line"
            onClick={() => setExpanded(false)}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <Textarea
        ref={textarea}
        aria-label={label}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus || (expanded && !area)}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-20 rounded-none border-0 shadow-none focus-visible:ring-0"
      />
    </div>
  );
}
