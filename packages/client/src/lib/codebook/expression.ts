import {
  newQuickJSWASMModuleFromVariant,
  shouldInterruptAfterDeadline,
  type QuickJSWASMModule,
} from "quickjs-emscripten-core";
import variant from "@jitl/quickjs-wasmfile-release-sync";
import { HELPER_PRELUDE, parseReference, referenceValue, type ReferenceScope } from "@annotinder/contracts";

/**
 * Shared QuickJS sandbox for evaluating codebook-authored JS expressions
 * (docs/client.md §5 -- script conditions, and `{{ }}` in templates,
 * docs/client.md §3). Both `conditions.ts` and `renderTemplate.ts` build on
 * `evaluateScript` rather than each loading/configuring their own QuickJS
 * instance.
 */
let quickJsModulePromise: Promise<QuickJSWASMModule> | null = null;

function loadQuickJS(): Promise<QuickJSWASMModule> {
  quickJsModulePromise ??= newQuickJSWASMModuleFromVariant(variant);
  return quickJsModulePromise;
}

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** How long one evaluation may run (docs/client.md §5). */
export const EXPRESSION_DEADLINE_MS = 100;

/** Adds the helper methods (`$var.q.is(...)`) to the scope inside the sandbox. */
const HELPER_SETUP = `$var = ${HELPER_PRELUDE}($var);`;

/**
 * Evaluates a codebook script against `{ $unit, $var }` (the only
 * names in scope), with the helper methods on `$var`. A script that is just
 * one reference is looked up directly, without starting QuickJS.
 */
export async function evaluateScript(script: string, scope: ReferenceScope): Promise<unknown> {
  const single = parseReference(script);
  if ("ref" in single) return referenceValue(scope, single.ref);
  return evaluateExpression(script, { $unit: scope.$unit, $var: scope.$var }, HELPER_SETUP);
}

/** A syntax error in a script, or null if it parses (it isn't run). For the admin editor. */
export async function scriptSyntaxError(script: string): Promise<string | null> {
  const QuickJS = await loadQuickJS();
  const vm = QuickJS.newContext();
  try {
    const result = vm.evalCode(`(($unit, $var) => (${script}\n))`);
    if (result.error) {
      const error = vm.dump(result.error) as { message?: string } | string;
      result.error.dispose();
      return typeof error === "string" ? error : (error?.message ?? "Syntax error");
    }
    result.value.dispose();
    return null;
  } finally {
    vm.dispose();
  }
}

/**
 * Evaluates `expression` (a JS expression) against a map of currently-known
 * values (unit data columns and/or variable values --
 * callers decide what's in scope), returning the raw (JSON-round-tripped)
 * result. Returns `undefined` and logs on any evaluation error (invalid
 * syntax, thrown error, timeout, OOM) rather than throwing, since a bad
 * expression shouldn't crash the coder's session. `setup` (statements) runs
 * first, e.g. to add the helper methods.
 */
export async function evaluateExpression(expression: string, values: Record<string, unknown>, setup = ""): Promise<unknown> {
  try {
    const QuickJS = await loadQuickJS();

    // Bind names that are valid JS identifiers (including $unit)
    const names = Object.keys(values).filter((name) => IDENTIFIER_RE.test(name));
    const args = names.map((name) => values[name]);

    const vm = QuickJS.newContext();
    try {
      vm.runtime.setMemoryLimit(1024 * 1024);
      vm.runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + EXPRESSION_DEADLINE_MS));

      const fnHandle = vm.newFunction("evaluate", (...handles) => {
        return handles[0];
      });
      fnHandle.dispose();

      const script = `((${names.join(", ")}) => { ${setup} return (${expression}\n); })`;
      const fnResult = vm.evalCode(script);
      if (fnResult.error) {
        console.error(`Failed to evaluate expression '${expression}':`, vm.dump(fnResult.error));
        fnResult.error.dispose();
        return undefined;
      }

      const argHandles = args.map((arg) => {
        const json = JSON.stringify(arg === undefined ? null : arg);
        const parsed = vm.evalCode(`(${json})`);
        if (parsed.error) {
          parsed.error.dispose();
          return vm.undefined;
        }
        return parsed.value;
      });

      const callResult = vm.callFunction(fnResult.value, vm.undefined, ...argHandles);
      fnResult.value.dispose();
      for (const h of argHandles) h.dispose();

      if (callResult.error) {
        console.error(`Failed to evaluate expression '${expression}':`, vm.dump(callResult.error));
        callResult.error.dispose();
        return undefined;
      }

      const raw = vm.dump(callResult.value);
      callResult.value.dispose();
      return raw;
    } finally {
      vm.dispose();
    }
  } catch (err) {
    console.error(`Failed to evaluate expression '${expression}':`, err);
    return undefined;
  }
}
