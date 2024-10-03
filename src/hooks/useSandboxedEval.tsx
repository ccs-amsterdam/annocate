"use cient";

import { GetJobState } from "@/app/types";
import { createContext, ReactElement, ReactNode, useContext } from "react";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

interface IFrameObj {
  senderId: string;
  receiverId: string;
  iframe: HTMLIFrameElement;
}

interface SandboxContextProps {
  evalStringTemplate: (str: string, data: Record<string, any>) => Promise<string>;
  evalStringWithJobState: (str: string, jobState: GetJobState) => Promise<string>;
  ready: boolean;
}

const SandboxContext = createContext<SandboxContextProps>({
  evalStringTemplate: async () => {
    throw new Error("Sandbox not ready");
  },
  evalStringWithJobState: async () => {
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
    <T extends any>(code: string, data: Record<string, any>, outputSchema: z.ZodType<T>): Promise<T> => {
      return new Promise((resolve, reject) => {
        if (!iframeObj?.iframe?.contentWindow) {
          reject(new Error("Sandboxed iframe not ready"));
          return;
        }

        const handleMessage = (event: MessageEvent) => {
          if (!iframeObj.iframe.contentWindow) return;
          if (event.source !== iframeObj.iframe.contentWindow) return;
          if (event.data.ready) {
            iframeObj.iframe.contentWindow.postMessage({ id: iframeObj.receiverId, code }, "*");
          }

          window.removeEventListener("message", handleMessage);
          try {
            const { id, result, error } = event.data;
            if (error) reject(error);
            if (id !== iframeObj.senderId) throw new Error("Invalid response id");
            resolve(outputSchema.parse(result));
          } catch (error) {
            reject(error);
          }
        };

        window.addEventListener("message", handleMessage);

        iframeObj.iframe.contentWindow.postMessage({ id: iframeObj.receiverId, code, data }, "*");
      });
    },
    [iframeObj],
  );

  const evalStringTemplate = useCallback(
    async (str: string, data: Record<string, any>): Promise<string> => {
      const { textParts, codeParts } = parseCodeFromString(str);

      let result = "";
      for (let i = 0; i < textParts.length; i++) {
        result += textParts[i];
        if (i >= codeParts.length) continue;

        try {
          result += await evalInSandbox(codeParts[i], data, z.coerce.string());
        } catch (e) {
          console.error(`ERROR in script {{${codeParts[i]}}}: `, e);
          result += "[...]";
        }
      }
      return result;
    },
    [evalInSandbox],
  );

  const evalStringWithJobState = useCallback(
    async (str: string, jobState: GetJobState): Promise<string> => {
      const data = {
        survey: jobState.surveyAnnotations,
      };
      return evalStringTemplate(str, data);
    },
    [evalStringTemplate],
  );

  return (
    <SandboxContext.Provider
      value={{
        evalStringTemplate,
        evalStringWithJobState,
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
                    let { id, code, data} = event.data;
                    const {unit, survey} = data;
                    const d = data

                    try {
                        if (event.source !== window.parent) throw new Error("Invalid source");
                        if (event.origin !== "${origin}") throw new Error("Invalid origin");
                        if (id !== "${receiverId}") throw new Error("Invalid request id");

                        id = null;
                        event = null;
                        const result = eval("(() => " + code + ")()");
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

function parseCodeFromString(str: string) {
  const regex = new RegExp(/{{(.*?)}}/); // Match text inside two square brackets
  const parts = str.split(regex);

  const textParts = parts.filter((p, i) => i % 2 === 0);
  const codeParts = parts.filter((p, i) => i % 2 === 1);

  return { textParts, codeParts };
}

function rebuildStringFromParts(textParts: string[], codeResultParts: string[]) {
  let result = "";

  for (let i = 0; i < textParts.length; i++) {
    result += textParts[i] + (codeResultParts[i] || "");
  }
  return result;
}
