import { useState, useEffect, useId } from "react";
import YAML from "yaml";
import { CodebookItemsSchema, type CodebookItem } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Sparkles } from "lucide-react";

interface CodebookYamlEditorProps {
  items: CodebookItem[];
  onChange: (items: CodebookItem[]) => void;
  disabled?: boolean;
}

interface ValidationError {
  path: string;
  message: string;
}

/**
 * YAML-based codebook editor (user TODO item).
 * Allows inspecting and editing codebook items directly as structured YAML,
 * with real-time Zod schema and tree structure validation.
 */
export function CodebookYamlEditor({ items, onChange, disabled }: CodebookYamlEditorProps) {
  const [yamlText, setYamlText] = useState(() => YAML.stringify(items, { indent: 2 }));
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [isValid, setIsValid] = useState(true);
  const textareaId = useId();

  // Sync external items into YAML text when switching into YAML mode
  useEffect(() => {
    try {
      const currentParsed = YAML.parse(yamlText);
      if (JSON.stringify(currentParsed) !== JSON.stringify(items)) {
        setYamlText(YAML.stringify(items, { indent: 2 }));
      }
    } catch {
      // Keep current text if in intermediate edit
    }
  }, [items]);

  function handleTextChange(newText: string) {
    setYamlText(newText);

    try {
      const parsed = YAML.parse(newText);
      if (!Array.isArray(parsed)) {
        setErrors([{ path: "root", message: "Codebook YAML must be a list (array) of items" }]);
        setIsValid(false);
        return;
      }

      const result = CodebookItemsSchema.safeParse(parsed);
      if (!result.success) {
        const issues = result.error.issues.map((issue) => {
          const path = issue.path.length > 0 ? issue.path.join(".") : "items";
          return {
            path,
            message: issue.message,
          };
        });
        setErrors(issues);
        setIsValid(false);
        return;
      }

      // Valid!
      setErrors([]);
      setIsValid(true);
      onChange(result.data);
    } catch (err) {
      setErrors([
        {
          path: "YAML Syntax",
          message: err instanceof Error ? err.message : "Invalid YAML syntax",
        },
      ]);
      setIsValid(false);
    }
  }

  function handleFormat() {
    try {
      const parsed = YAML.parse(yamlText);
      const formatted = YAML.stringify(parsed, { indent: 2 });
      setYamlText(formatted);
      handleTextChange(formatted);
    } catch {
      // Ignore format if syntax error
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Status Bar */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
        <div className="flex items-center gap-2">
          {isValid ? (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-600 dark:text-teal-400">
              <CheckCircle2 className="h-4 w-4" />
              <span>Valid YAML & Codebook Schema</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>
                {errors.length} {errors.length === 1 ? "validation issue" : "validation issues"}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleFormat}
            disabled={disabled || !isValid}
            className="flex items-center gap-1 text-xs"
          >
            <Sparkles className="h-3 w-3" />
            Format YAML
          </Button>
        </div>
      </div>

      {/* Error Details Box */}
      {!isValid && errors.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
          <div className="font-semibold text-destructive mb-1">Validation Errors:</div>
          <ul className="space-y-1">
            {errors.map((err, idx) => (
              <li key={idx} className="flex items-start gap-1.5 font-mono">
                <span className="shrink-0 rounded bg-destructive/20 px-1 py-0.2 text-[11px] font-bold text-destructive">
                  {err.path}
                </span>
                <span className="text-foreground">{err.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Editor Textarea */}
      <div className="relative flex-1 overflow-hidden rounded-lg border border-input bg-card">
        <label htmlFor={textareaId} className="sr-only">Codebook YAML Editor</label>
        <textarea
          id={textareaId}
          value={yamlText}
          disabled={disabled}
          onChange={(e) => handleTextChange(e.target.value)}
          spellCheck={false}
          className="h-full w-full resize-none p-3 font-mono text-xs leading-relaxed text-foreground bg-transparent focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="# Enter codebook items in YAML format..."
        />
      </div>
    </div>
  );
}
