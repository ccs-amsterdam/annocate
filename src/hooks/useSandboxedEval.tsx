"use cient";

import { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

interface IFrameObj {
  senderId: string;
  receiverId: string;
  iframe: HTMLIFrameElement;
}

export function useSandboxedEval(data: Record<string, any>) {
  const [iframeObj, setIframeObj] = useState<IFrameObj | null>(null);

  useEffect(() => {
    const jsonData = JSON.stringify(data);
    const origin = window.location.origin;
    const senderId = window.crypto.randomUUID();
    const receiverId = window.crypto.randomUUID();
    const iframe = createSandboxedIframe(jsonData, origin, senderId, receiverId);
    document.body.appendChild(iframe);
    setIframeObj({ iframe, senderId, receiverId });
    return () => {
      document.body.removeChild(iframe);
    };
  }, [data]);

  const evalInSandbox = useCallback(
    <T extends any>(code: string, outputSchema: z.ZodType<T>): Promise<T> => {
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

        iframeObj.iframe.contentWindow.postMessage({ id: iframeObj.receiverId, code }, "*");
      });
    },
    [iframeObj],
  );

  const evalStringTemplate = useCallback(
    async (str: string): Promise<string> => {
      const { textParts, codeParts } = parseCodeFromString(str);
      const codeResultParts: string[] = [];

      let result = "";
      for (let i = 0; i < textParts.length; i++) {
        result += textParts[i];
        if (i >= codeParts.length) continue;

        try {
          result += await evalInSandbox(codeParts[i], z.coerce.string());
        } catch (e) {
          console.error(`ERROR in script {{${codeParts[i]}}}: `, e);
          result += "[...]";
        }
      }
      return result;
    },
    [evalInSandbox],
  );

  return { evalInSandbox, evalStringTemplate, ready: !!iframeObj };
}

function createSandboxedIframe(jsonData: string, origin: string, senderId: string, receiverId: string) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("style", "display: none");
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute("id", "sandy");

  const jsonStringEncoded = encodeURIComponent(jsonData);

  iframe.srcdoc = `<!doctype html>
    <html>
        <head>
            <script>
                delete window.fetch;
                delete window.XMLHttpRequest;

                const jsonString = decodeURIComponent("${jsonStringEncoded}");
                const {unit, survey} = JSON.parse(jsonString)
    
                const handleMessage = (event) => {
                    let { id, code} = event.data;

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
    console.log(codeResultParts[i]);
    result += textParts[i] + (codeResultParts[i] || "");
  }
  return result;
}
