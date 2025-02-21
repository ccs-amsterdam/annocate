"use cient";

import { GetJobState, JobState } from "@/app/types";
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
  evalStringWithJobState: (str: string, jobState: JobState) => Promise<string>;
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

        console.log(data);
        iframeObj.iframe.contentWindow.postMessage({ id: iframeObj.receiverId, script, data }, "*");
      });
    },
    [iframeObj],
  );

  const evalStringTemplate = useCallback(
    async (str: string, data: Record<string, any>): Promise<string> => {
      const { textParts, scriptParts } = parseScriptFromString(str);

      let result = "";
      for (let i = 0; i < textParts.length; i++) {
        result += textParts[i];
        if (i >= scriptParts.length) continue;

        try {
          console.log(scriptParts[i]);
          result += await evalInSandbox(scriptParts[i], data, z.coerce.string());
        } catch (e) {
          console.log(`ERROR in script {{${scriptParts[i]}}}: `, e);
          result += "[...]";
        }
      }
      console.log(result);
      return result;
    },
    [evalInSandbox],
  );

  const evalStringWithJobState = useCallback(
    async (str: string, jobState: JobState): Promise<string> => {
      return evalStringTemplate(str, jobState);
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
                    let { id, script, data} = event.data;

                    // Accessor functions
                    const unit = (str) => data?.unitData?.[str]
                    const code = (str) => data?.annotations?.[str]?.code
                    const value = (str) => data?.annotations?.[str]?.value

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

function replaceShorthand(str: string, accessor: string): string {
  const regex = new RegExp(`\\b${accessor}\\$(\\w+)`, "g");
  return str.replace(regex, `{{${accessor}('$1')}}`);
}

function parseScriptFromString(str: string) {
  for (let accessor of ["unit", "code", "value"]) {
    str = replaceShorthand(str, accessor);
  }
  console.log(str);

  const regex = new RegExp(/{{(.*?)}}/); // Match text inside two square brackets
  const parts = str.split(regex);

  const textParts = parts.filter((p, i) => i % 2 === 0);
  const scriptParts = parts.filter((p, i) => i % 2 === 1);

  return { textParts, scriptParts };
}
