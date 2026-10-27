import { lazy, Suspense } from "react";
import type { MonacoJsonProps } from "./MonacoJson";

const MonacoJson = lazy(() => import("./MonacoJson"));

/** A JSON code editor for codebooks (Monaco, loaded when first shown). */
export function JsonCodeEditor(props: MonacoJsonProps) {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-muted-foreground">Loading editor...</div>}>
      <MonacoJson {...props} />
    </Suspense>
  );
}

export { CODEBOOK_MODEL, ITEM_MODEL } from "./models";
