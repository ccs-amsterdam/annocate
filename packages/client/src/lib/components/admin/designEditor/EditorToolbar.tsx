import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  Code2,
  FileDown,
  History,
  Redo2,
  RotateCcw,
  Sliders,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedToggle } from "./SegmentedToggle";
import type { DesignEditorMode } from "../../../design/versions";

export type EditorView = "tree" | "json";

/** What saving does now, for the Save button's tooltip. */
function saveTitle({ dirty, live, withErrors }: { dirty: boolean; live: boolean; withErrors: boolean }): string {
  if (!dirty) return "No changes to save";
  if (live) return "Save your changes as a new draft. Coders keep using the live version until you deploy.";
  if (withErrors) return "Saves the draft as it is; fix the issues before deploying";
  return "Save the draft; deploy it on the Deploy page";
}

/** An issue as the toolbar lists it: the message, and the item it is about (if known). */
export interface EditorIssue {
  message: string;
  /** The item's name; null if the issue isn't about one item. */
  item: string | null;
  /** Locates the item (validation issue path, or its name). */
  target: { path: (string | number)[] } | { name: string } | null;
}

interface EditorToolbarProps {
  mode: DesignEditorMode;
  /** Which version is open and whether coders use it (DesignStatusBanner), shown beside the view toggle. */
  status?: ReactNode;
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
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Items with unsaved changes, in design order (for "revert item"). */
  changedItems: ChangedItem[];
  onRevertItem: (key: string) => void;
  onRevertAll: () => void;
  saving: boolean;
  onSave: () => void;
  onOpenVersions?: () => void;
  /** Download the codebook (what coders see, Markdown) or the design file (all of the design, JSON). */
  onExport?: (kind: "codebook" | "design") => void;
}

/** Issue count and view toggle on the left; Versions, Save and Deploy on the right. */
export function EditorToolbar({
  mode,
  view,
  onViewChange,
  errors,
  warnings,
  onOpenIssue,
  dirty,
  canSave,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  changedItems,
  onRevertItem,
  onRevertAll,
  saving,
  onSave,
  onOpenVersions,
  onExport,
  status,
}: EditorToolbarProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const readOnly = mode === "history";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <IssuesMenu
          issues={errors}
          label="issue"
          icon={AlertCircle}
          tone="bg-destructive/10 text-destructive"
          onOpen={onOpenIssue}
        />
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
            { value: "json", label: "JSON", icon: Code2 },
          ]}
        />
        {status}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!readOnly && (
          <div className="flex items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo"
              aria-label="Undo"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo"
              aria-label="Redo"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
            <RevertMenu
              dirty={dirty}
              changedItems={changedItems}
              onRevertItem={onRevertItem}
              onRevertAll={onRevertAll}
            />
          </div>
        )}

        {onExport && (
          <Popover open={exportOpen} onOpenChange={setExportOpen}>
            <PopoverTrigger asChild>
              <IconButton icon={FileDown} label="Export" />
            </PopoverTrigger>
            <PopoverContent align="end" className="flex w-72 flex-col gap-1 p-1">
              <button
                type="button"
                className="rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  setExportOpen(false);
                  onExport("codebook");
                }}
              >
                Codebook (Markdown)
                <span className="block text-xs text-muted-foreground">
                  What coders see, as a document, e.g. for a paper
                </span>
              </button>
              <button
                type="button"
                className="rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  setExportOpen(false);
                  onExport("design");
                }}
              >
                Design file (JSON)
                <span className="block text-xs text-muted-foreground">
                  All of the design, with the AnnoTinder version: to archive or reproduce it
                </span>
              </button>
            </PopoverContent>
          </Popover>
        )}

        {onOpenVersions && <IconButton icon={History} label="Versions" onClick={onOpenVersions} />}

        {!readOnly && (
          <Button
            type="button"
            size="sm"
            onClick={onSave}
            disabled={saving || !canSave}
            title={saveTitle({ dirty, live: mode === "live", withErrors: errors.length > 0 })}
          >
            {saving ? "Saving..." : mode === "live" ? "Save as draft" : "Save"}
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
        <button
          type="button"
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${tone}`}
        >
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

/** An item with unsaved changes, as the revert menu lists it. */
export interface ChangedItem {
  key: string;
  name: string;
  /** New since the last save: reverting removes it. */
  isNew: boolean;
}

/** Going back to the last save: one of the changed items, or everything. */
function RevertMenu({
  dirty,
  changedItems,
  onRevertItem,
  onRevertAll,
}: {
  dirty: boolean;
  changedItems: ChangedItem[];
  onRevertItem: (key: string) => void;
  onRevertAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const choose = (action: () => void) => {
    setOpen(false);
    action();
  };
  const row = "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!dirty}
          className="gap-1 text-xs"
          title="Go back to the last save"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Revert
          <ChevronDown className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1">
        {changedItems.length > 0 && (
          <>
            <p className="px-2 pt-1.5 pb-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Revert item
            </p>
            <ul className="max-h-60 overflow-y-auto">
              {changedItems.map((item) => (
                <li key={item.key}>
                  <button type="button" className={row} onClick={() => choose(() => onRevertItem(item.key))}>
                    <span className="truncate font-mono text-foreground">{item.name || "(unnamed)"}</span>
                    {item.isNew && <span className="shrink-0 text-muted-foreground">new: removes it</span>}
                  </button>
                </li>
              ))}
            </ul>
            <div className="my-1 border-t border-border" />
          </>
        )}
        <button type="button" className={`${row} font-semibold text-foreground`} onClick={() => choose(onRevertAll)}>
          Revert all changes
        </button>
      </PopoverContent>
    </Popover>
  );
}
