// `pnpm dev`: the server with development auth headers, so the dev shell's
// researcher UI works without an API key.
process.env.ANNOTINDER_DEV_AUTH ??= "1";
await import("./index.js");
