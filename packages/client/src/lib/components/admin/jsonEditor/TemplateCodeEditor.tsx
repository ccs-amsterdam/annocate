import { lazy, Suspense } from "react";
import type { MonacoTemplateProps } from "./MonacoTemplate";

const MonacoTemplate = lazy(() => import("./MonacoTemplate"));

/** A unit template editor (Monaco, loaded when first shown). */
export function TemplateCodeEditor(props: MonacoTemplateProps) {
  return (
    <Suspense fallback={<div className="flex h-60 items-center justify-center text-xs text-muted-foreground">Loading editor...</div>}>
      <MonacoTemplate {...props} />
    </Suspense>
  );
}

export type { TemplateNames } from "./MonacoTemplate";
