import { AlertCircle, AlertTriangle, Code2, History, Rocket, Sliders } from "lucide-react";
import type { CodebookValidationIssue } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { SegmentedToggle } from "./SegmentedToggle";
import type { CodebookEditorMode } from "../CodebookEditor";

export type EditorView = "tree" | "yaml";

interface EditorToolbarProps {
  mode: CodebookEditorMode;
  view: EditorView;
  onViewChange: (view: EditorView) => void;
  validationIssues: CodebookValidationIssue[];
  /** Things that don't block saving, e.g. references to unit fields that don't exist. */
  warnings: string[];
  dirty: boolean;
  canSave: boolean;
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
  validationIssues,
  warnings,
  dirty,
  canSave,
  saving,
  onSave,
  onPublish,
  onOpenVersions,
}: EditorToolbarProps) {
  const readOnly = mode === "history";
  const canPublish = canSave && (dirty || mode === "draft");

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-3">
      <div className="flex items-center gap-3">
        {validationIssues.length > 0 && (
          <span
            className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive"
            title={validationIssues.map((i) => i.message).join("\n")}
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {validationIssues.length} issue{validationIssues.length === 1 ? "" : "s"}
          </span>
        )}

        {warnings.length > 0 && (
          <span
            className="flex items-center gap-1.5 rounded-md bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400"
            title={warnings.join("\n")}
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {warnings.length} warning{warnings.length === 1 ? "" : "s"}
          </span>
        )}

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
            disabled={!dirty || saving || !canSave}
            title={
              validationIssues.length > 0
                ? "Fix validation issues before saving"
                : !dirty
                  ? "No changes to save"
                  : mode === "live"
                    ? "Save your changes as a new draft. Coders keep using the live version until you publish."
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
              !canSave
                ? "Fix validation issues before publishing"
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
