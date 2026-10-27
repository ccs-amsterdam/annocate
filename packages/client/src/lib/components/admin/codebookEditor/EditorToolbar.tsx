import { AlertCircle, AlertTriangle, ChevronDown, Code2, History, Redo2, Rocket, RotateCcw, Sliders, Undo2, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedToggle } from "./SegmentedToggle";
import type { CodebookEditorMode } from "../CodebookEditor";

export type EditorView = "tree" | "yaml";

/** An issue as the toolbar lists it: the message, and the item it is about (if known). */
export interface EditorIssue {
  message: string;
  /** The item's name; null if the issue isn't about one item. */
  item: string | null;
  /** Locates the item (validation issue path, or its name). */
  target: { path: (string | number)[] } | { name: string } | null;
}

interface EditorToolbarProps {
  mode: CodebookEditorMode;
  view: EditorView;
  onViewChange: (view: EditorView) => void;
  /** Problems that block saving. */
  errors: EditorIssue[];
  /** Things that don't block saving, e.g. references to unit fields that don't exist. */
  warnings: EditorIssue[];
  /** Opens the item an issue is about. */
  onOpenIssue: (issue: EditorIssue) => void;
  dirty: boolean;
  canSave: boolean;
  /** Whether the codebook passes validation (required to publish). */
  valid: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** The selected item, if it has unsaved changes (for "revert this item"). */
  changedItem: { name: string; isNew: boolean } | null;
  onRevertItem: () => void;
  onRevertAll: () => void;
  saving: boolean;
  onSave: () => void;
  /** Omit to hide the Publish button. */
  onPublish?: () => void;
  onOpenVersions?: () => void;
}

/** Issue count and view toggle on the left; Versions, Save and Publish on the right. */
export function EditorToolbar({
  mode,
  view,
  onViewChange,
  errors,
  warnings,
  onOpenIssue,
  dirty,
  canSave,
  valid,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  changedItem,
  onRevertItem,
  onRevertAll,
  saving,
  onSave,
  onPublish,
  onOpenVersions,
}: EditorToolbarProps) {
  const readOnly = mode === "history";
  const canPublish = !readOnly && valid && (dirty || mode === "draft");

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-3">
      <div className="flex items-center gap-3">
        <IssuesMenu issues={errors} label="issue" icon={AlertCircle} tone="bg-destructive/10 text-destructive" onOpen={onOpenIssue} />
        <IssuesMenu
          issues={warnings}
          label="warning"
          icon={AlertTriangle}
          tone="bg-amber-500/15 text-amber-700 dark:text-amber-400"
          onOpen={onOpenIssue}
        />

        <SegmentedToggle
          value={view}
          onChange={onViewChange}
          options={[
            { value: "tree", label: "Visual", icon: Sliders },
            { value: "yaml", label: "YAML", icon: Code2 },
          ]}
        />
      </div>

      <div className="flex items-center gap-2">
        {!readOnly && (
          <div className="flex items-center">
            <Button type="button" variant="ghost" size="icon-sm" onClick={onUndo} disabled={!canUndo} title="Undo" aria-label="Undo">
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" onClick={onRedo} disabled={!canRedo} title="Redo" aria-label="Redo">
              <Redo2 className="h-4 w-4" />
            </Button>
            <RevertMenu dirty={dirty} changedItem={changedItem} onRevertItem={onRevertItem} onRevertAll={onRevertAll} />
          </div>
        )}

        {onOpenVersions && (
          <Button type="button" variant="outline" size="sm" onClick={onOpenVersions} className="flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" />
            Versions
          </Button>
        )}

        {!readOnly && (
          <Button
            type="button"
            size="sm"
            variant={onPublish ? "outline" : "default"}
            onClick={onSave}
            disabled={saving || !canSave}
            title={
              !dirty
                ? "No changes to save"
                : mode === "live"
                  ? "Save your changes as a new draft. Coders keep using the live version until you publish."
                  : errors.length > 0
                    ? "Saves the draft as it is; fix the issues before publishing"
                    : undefined
            }
          >
            {saving ? "Saving..." : mode === "live" ? "Save as draft" : "Save"}
          </Button>
        )}

        {onPublish && !readOnly && (
          <Button
            type="button"
            size="sm"
            onClick={onPublish}
            disabled={!canPublish || saving}
            title={
              !valid
                ? "Fix the codebook's issues before publishing"
                : !canPublish
                  ? "This version is already live"
                  : "Make this version live: coders switch to it at their next unit"
            }
            className="flex items-center gap-1.5"
          >
            <Rocket className="h-3.5 w-3.5" />
            Publish
          </Button>
        )}
      </div>
    </div>
  );
}

/** A badge with the number of issues; opens their list, and a click on one opens its item. */
function IssuesMenu({
  issues,
  label,
  icon: Icon,
  tone,
  onOpen,
}: {
  issues: EditorIssue[];
  label: string;
  icon: LucideIcon;
  tone: string;
  onOpen: (issue: EditorIssue) => void;
}) {
  const [open, setOpen] = useState(false);
  if (issues.length === 0) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${tone}`}>
          <Icon className="h-3.5 w-3.5 shrink-0" />
          {issues.length} {label}
          {issues.length === 1 ? "" : "s"}
          <ChevronDown className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-80 w-96 overflow-y-auto p-1">
        <ul className="flex flex-col">
          {issues.map((issue, i) => (
            <li key={i}>
              <button
                type="button"
                disabled={!issue.target}
                onClick={() => {
                  setOpen(false);
                  onOpen(issue);
                }}
                className="flex w-full flex-col items-start gap-0.5 rounded px-2 py-1.5 text-left text-xs hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
              >
                {issue.item && <span className="font-mono font-semibold text-foreground">{issue.item}</span>}
                <span className="text-muted-foreground">{issue.message}</span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Going back to the last save: one item, or everything. In a menu with a
 * short explanation, since "revert" alone is easy to misread.
 */
function RevertMenu({
  dirty,
  changedItem,
  onRevertItem,
  onRevertAll,
}: {
  dirty: boolean;
  changedItem: { name: string; isNew: boolean } | null;
  onRevertItem: () => void;
  onRevertAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const choose = (action: () => void) => {
    setOpen(false);
    action();
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" disabled={!dirty} className="gap-1 text-xs" title="Go back to the last save">
          <RotateCcw className="h-3.5 w-3.5" />
          Revert
          <ChevronDown className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1">
        <button
          type="button"
          disabled={!changedItem}
          onClick={() => choose(onRevertItem)}
          className="flex w-full flex-col items-start gap-0.5 rounded px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50 disabled:hover:bg-transparent"
        >
          <span className="font-semibold text-foreground">
            {changedItem ? `Revert ${changedItem.name}` : "Revert the selected item"}
          </span>
          <span className="text-muted-foreground">
            {changedItem?.isNew
              ? "This item is new since the last save: it is removed."
              : changedItem
                ? "Back to how it was at the last save. Other items keep their changes."
                : "The selected item has no unsaved changes."}
          </span>
        </button>
        <button
          type="button"
          onClick={() => choose(onRevertAll)}
          className="flex w-full flex-col items-start gap-0.5 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
        >
          <span className="font-semibold text-foreground">Revert all unsaved changes</span>
          <span className="text-muted-foreground">The whole codebook back to the last save. You can still undo this.</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}
