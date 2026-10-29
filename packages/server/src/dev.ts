// `pnpm dev`: the server with development auth headers (so the dev shell's
// researcher UI works without an API key) and the demo job in an empty database.
process.env.ANNOTINDER_DEV_AUTH ??= "1";
process.env.ANNOTINDER_DEMO ??= "1";
await import("./index.js");
