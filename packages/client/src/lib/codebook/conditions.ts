import {
  newQuickJSWASMModuleFromVariant,
  shouldInterruptAfterDeadline,
  type QuickJSWASMModule,
} from "quickjs-emscripten-core";
import variant from "@jitl/quickjs-wasmfile-release-sync";

/**
 * Evaluates a codebook `condition` item's expression (design plan §2/§11)
 * against a map of currently-known variable values (name -> the value the
 * coder picked, e.g. a code string).
 *
 * Uses real JavaScript, run inside a QuickJS WASM sandbox
 * (`quickjs-emscripten-core` + the `@jitl/quickjs-wasmfile-release-sync`
 * variant -- a single release build, not the "batteries included"
 * `quickjs-emscripten` package, which bundles four WASM variants and
 * meaningfully bloats the client bundle) rather than CEL. History: this file first used an
 * unsandboxed `new Function` (flagged as a real risk in `hardening_eval.txt`
 * -- a job admin's expression could affect *other* people's sessions if
 * ever evaluated server-side, or escape via shared prototypes/globals),
 * then briefly switched to CEL to get a "safe by construction" expression
 * language with cross-language support. After discussing tradeoffs
 * (2026-09-18, see design plan §11), we settled on QuickJS instead: it's
 * real, widely-known JS (unlike CEL, no bespoke mini-language for codebook
 * authors to learn), and genuinely sandboxed -- a separate WASM
 * interpreter/heap with zero ambient access (no host prototypes, no I/O)
 * unless explicitly bound in. Cross-language story: Node/browser use this
 * package directly; Python has actively-maintained QuickJS bindings; R
 * already has a mature CRAN package (`V8`, real Google V8) for embedding
 * JS, so a from-scratch language binding is not required for any target
 * runtime. `shouldInterrupt`/`memoryLimitBytes` guard against runaway or
 * hostile expressions (infinite loops, excessive allocation).
 */
let quickJsModulePromise: Promise<QuickJSWASMModule> | null = null;

function loadQuickJS(): Promise<QuickJSWASMModule> {
  quickJsModulePromise ??= newQuickJSWASMModuleFromVariant(variant);
  return quickJsModulePromise;
}

const IDENTIFIER_RE = /^[A-Za-z_]\w*$/;

export async function evaluateCondition(expression: string, values: Record<string, unknown>): Promise<boolean> {
  try {
    const QuickJS = await loadQuickJS();

    // Only bind names that are valid JS identifiers (SafeNameSchema technically
    // allows e.g. a leading digit, which can't be a `let` binding name -- such
    // names are silently excluded from the evaluated scope).
    const names = Object.keys(values).filter((name) => IDENTIFIER_RE.test(name));
    const context: Record<string, unknown> = {};
    for (const name of names) context[name] = values[name];

    const bindings = names.map((name) => `let ${name} = __ctx[${JSON.stringify(name)}];`).join("\n");
    const code = `
      const __ctx = ${JSON.stringify(context)};
      ${bindings}
      Boolean(${expression});
    `;

    const result = QuickJS.evalCode(code, {
      shouldInterrupt: shouldInterruptAfterDeadline(Date.now() + 500),
      memoryLimitBytes: 1024 * 1024,
    });
    return Boolean(result);
  } catch (err) {
    console.error(`Failed to evaluate condition '${expression}':`, err);
    return false;
  }
}
