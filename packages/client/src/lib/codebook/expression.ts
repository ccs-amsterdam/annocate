import {
  newQuickJSWASMModuleFromVariant,
  shouldInterruptAfterDeadline,
  type QuickJSWASMModule,
} from "quickjs-emscripten-core";
import variant from "@jitl/quickjs-wasmfile-release-sync";

/**
 * Shared QuickJS sandbox for evaluating codebook-authored JS expressions
 * (design plan §11 -- `condition` items' `expression`, and unit_loop layout
 * templates' `{{ expression }}` interpolation, §11f). Both `conditions.ts`
 * and `renderTemplate.ts` build on `evaluateExpression` rather than each
 * loading/configuring their own QuickJS instance.
 */
let quickJsModulePromise: Promise<QuickJSWASMModule> | null = null;

function loadQuickJS(): Promise<QuickJSWASMModule> {
  quickJsModulePromise ??= newQuickJSWASMModuleFromVariant(variant);
  return quickJsModulePromise;
}

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Evaluates `expression` (a JS expression) against a map of currently-known
 * values (unit data columns, layout constants, and/or variable values --
 * callers decide what's in scope), returning the raw (JSON-round-tripped)
 * result. Returns `undefined` and logs on any evaluation error (invalid
 * syntax, thrown error, timeout, OOM) rather than throwing, since a bad
 * expression shouldn't crash the coder's session.
 */
export async function evaluateExpression(expression: string, values: Record<string, unknown>): Promise<unknown> {
  try {
    const QuickJS = await loadQuickJS();

    // Bind names that are valid JS identifiers (including $unit)
    const names = Object.keys(values).filter((name) => IDENTIFIER_RE.test(name));
    const args = names.map((name) => values[name]);

    const vm = QuickJS.newContext();
    try {
      vm.runtime.setMemoryLimit(1024 * 1024);
      vm.runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + 100));

      const fnHandle = vm.newFunction("evaluate", (...handles) => {
        return handles[0];
      });
      fnHandle.dispose();

      const script = `((${names.join(", ")}) => (${expression}))`;
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
