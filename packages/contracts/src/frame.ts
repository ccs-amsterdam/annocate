// The `::html` frame's one script (client SandboxedHtml.tsx): it reports
// the content's height to the app. Shared, because the server's Content
// Security Policy allows it by its hash: an iframe's `srcdoc` document also
// falls under the policy of the page it is in (server securityHeaders.ts).

/** The only script allowed in an `::html` frame: it reports the content's height. */
export const RESIZE_SCRIPT =
  'new ResizeObserver(function(){parent.postMessage({annotinderFrameHeight:Math.ceil(document.body.getBoundingClientRect().height)},"*")}).observe(document.body);';
/** sha256 of RESIZE_SCRIPT, base64 (checked in the client's SandboxedHtml.test.tsx). */
export const RESIZE_SCRIPT_HASH = "sha256-fDbURvv7d4gKnJzPJjgEyrTckVVa3JA+OmT2bxumx4Y=";
