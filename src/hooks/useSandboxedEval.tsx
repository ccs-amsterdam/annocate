"use cient";

import { Annotation, DataIndicator, GetSession, ScriptData, Unit, UnitData } from "@/app/types";
import { JobContext } from "@/components/AnnotatorProvider/AnnotatorProvider";
import { avgArray, uniqueArray } from "@/functions/utils";
import { createContext, ReactElement, ReactNode, useContext } from "react";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

interface IFrameObj {
  senderId: string;
  receiverId: string;
  iframe: HTMLIFrameElement;
}

interface SandboxContextProps {
  evalStringTemplate: (str: string, data: ScriptData) => Promise<string>;
  evalStringWithJobContext: (str: string, context: JobContext) => Promise<string>;
  ready: boolean;
}

const accessors = ["unit", "code", "value", "codes", "values"] as const;

const SandboxContext = createContext<SandboxContextProps>({
  evalStringTemplate: async () => {
    throw new Error("Sandbox not ready");
  },
  evalStringWithJobContext: async () => {
    throw new Error("Sandbox not ready");
  },
  ready: false,
});

export const useSandbox = () => {
  return useContext(SandboxContext);
};

export function SandboxedProvider({ children }: { children: ReactNode }) {
  const [iframeObj, setIframeObj] = useState<IFrameObj | null>(null);

  useEffect(() => {
    const origin = window.location.origin;
    const senderId = window.crypto.randomUUID();
    const receiverId = window.crypto.randomUUID();
    const iframe = createSandboxedIframe(origin, senderId, receiverId);
    document.body.appendChild(iframe);
    setIframeObj({ iframe, senderId, receiverId });
    return () => {
      if (document.body.contains(iframe)) document.body.removeChild(iframe);
    };
  }, []);

  const evalInSandbox = useCallback(
    <T extends any>(script: string, data: Record<string, any>, outputSchema: z.ZodType<T>): Promise<T> => {
      return new Promise((resolve, reject) => {
        if (!iframeObj?.iframe?.contentWindow) {
          reject(new Error("Sandboxed iframe not ready"));
          return;
        }

        const handleMessage = (event: MessageEvent) => {
          if (!iframeObj.iframe.contentWindow) return;
          if (event.source !== iframeObj.iframe.contentWindow) return;
          // if (event.data.ready) {
          //   iframeObj.iframe.contentWindow.postMessage({ id: iframeObj.receiverId, script }, "*");
          // }

          try {
            const { id, result, error } = event.data;
            if (error) reject(error);
            if (id !== iframeObj.senderId) throw new Error("Invalid response id");
            resolve(outputSchema.parse(result));
          } catch (error) {
            reject(error);
          }
          window.removeEventListener("message", handleMessage);
        };

        window.addEventListener("message", handleMessage);

        iframeObj.iframe.contentWindow.postMessage({ id: iframeObj.receiverId, script, data }, "*");
      });
    },
    [iframeObj],
  );

  const evalStringTemplate = useCallback(
    async (str: string, data: ScriptData): Promise<string> => {
      const { textParts, scriptParts } = parseScriptFromString(str, data);

      let result = "";
      for (let i = 0; i < textParts.length; i++) {
        result += textParts[i];
        if (i >= scriptParts.length) continue;

        try {
          result += await evalInSandbox(scriptParts[i], data, z.coerce.string());
        } catch (e) {
          console.log(`ERROR in script {{${scriptParts[i]}}}: `, e);
          result += "[...]";
        }
      }
      return result;
    },
    [evalInSandbox],
  );

  const evalBoolean = useCallback(
    async (str: string, data: ScriptData): Promise<boolean> => {
      return await evalInSandbox(str, data, z.coerce.boolean());
    },
    [evalInSandbox],
  );

  const evalStringWithJobContext = useCallback(
    async (str: string, jobContext: JobContext): Promise<string> => {
      const dataIndicators = extractDataIndictors(str);
      const scriptData = prepareScriptData(dataIndicators, jobContext);
      return evalStringTemplate(str, scriptData);
    },
    [evalStringTemplate],
  );

  return (
    <SandboxContext.Provider
      value={{
        evalStringTemplate,
        evalStringWithJobContext,
        ready: !!iframeObj,
      }}
    >
      {children}
    </SandboxContext.Provider>
  );
}

function createSandboxedIframe(origin: string, senderId: string, receiverId: string) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("style", "display: none");
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute("id", "sandy");

  iframe.srcdoc = `<!doctype html>
    <html>
        <head>
            <script>
                delete window.fetch;
                delete window.XMLHttpRequest;

                const handleMessage = (event) => {
                    let { id, script, data} = event.data;

                    // Accessor functions
                    const ___get_data___ = (accessor, name) => data?.[accessor]?.[name]

                    try {
                        if (event.source !== window.parent) throw new Error("Invalid source");
                        if (event.origin !== "${origin}") throw new Error("Invalid origin");
                        if (id !== "${receiverId}") throw new Error("Invalid request id");

                        id = null;
                        event = null;
                        const result = eval("(() => " + script + ")()");
                        window.parent.postMessage({ id: "${senderId}", result }, "${origin}");
                    } catch (error) {
                        window.parent.postMessage({ id: "${senderId}", error: error.message }, "${origin}");
                    }
                };
                window.addEventListener("message", handleMessage);
                window.parent.postMessage({ id: "${senderId}", ready: true }, "*")
            </script>
        </head>
    </html>
  `;

  return iframe;
}

export function extractDataIndictors(str: string): DataIndicator[] {
  const dataIndicators: DataIndicator[] = [];

  for (let accessor of accessors) {
    const regex = new RegExp(`\\b@${accessor}\.(\\w+)`, "g");
    const matches = str.matchAll(regex);
    for (let match of matches) {
      const name = match[2] as string;
      if (accessor === "unit") {
        dataIndicators.push({ type: "unit", accessor, field: name });
      } else {
        dataIndicators.push({ type: "annotation", accessor, variableName: name });
      }
    }
  }

  return dataIndicators;
}

function prepareScriptData(dataIndicators: DataIndicator[], jobContext: JobContext): ScriptData {
  const scriptData: ScriptData = { unit: {}, code: {}, value: {}, codes: {}, values: {} };
  for (let dataIndicator of dataIndicators) {
    const { type, accessor } = dataIndicator;

    if (type === "unit") {
      const field = dataIndicator.field;
      if (accessor === "unit") {
        const value = jobContext.unit?.data?.[field];
        if (value !== undefined) scriptData.unit[field] = value;
        continue;
      }
    }

    if (type === "annotation") {
      // For annotation type accessors we need to find the annotations for the variables
      const variableName = dataIndicator.variableName;
      const variable = Object.values(jobContext.variableMap).find((v) => v.name === variableName);
      const annotations =
        Object.values(jobContext.annotationLib.annotations).filter((a) => a.variableId === variable?.id) || [];
      if (annotations.length === 0) continue;

      if (accessor === "code") {
        scriptData.code[variableName] = uniqueArray(annotations.map((a) => a.code || null)).join(", ");
      }
      if (accessor === "value") {
        scriptData.value[variableName] = avgArray(annotations.map((a) => a.value || null).filter((a) => a !== null));
      }
      if (accessor === "codes") {
        scriptData.codes[variableName] = annotations.map((a) => a.code || null);
      }
      if (accessor === "values") {
        scriptData.values[variableName] = annotations.map((a) => a.value || null);
      }
    }
  }

  return scriptData;
}

function replaceDataIndicatorWithAccessor(str: string, accessor: keyof ScriptData): string {
  const regex = new RegExp(`\\b@${accessor}\.(\\w+)`, "g");
  return str.replaceAll(regex, `___get_data___('${accessor}','$1')`);
}

function replaceDataIndicatorWithText(str: string, accessor: keyof ScriptData, scriptData: ScriptData): string {
  const regex = new RegExp(`\\b@${accessor}\.(\\w+)`, "g");
  return str.replaceAll(regex, (match, acc, key) => {
    return String(scriptData[accessor][key]);
  });
}

function parseScriptFromString(str: string, scriptData: ScriptData) {
  const regex = new RegExp(/{{(.*?)}}/); // Match text inside two square brackets
  const parts = str.split(regex);

  const textParts = parts.filter((p, i) => i % 2 === 0);
  const scriptParts = parts.filter((p, i) => i % 2 === 1);

  for (let i = 0; i < parts.length; i++) {
    for (let accessor of accessors) {
      textParts[i] = replaceDataIndicatorWithText(scriptParts[i], accessor, scriptData);
      scriptParts[i] = replaceDataIndicatorWithAccessor(scriptParts[i], accessor);
    }
  }

  return { textParts, scriptParts };
}
