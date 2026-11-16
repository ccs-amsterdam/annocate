// `pnpm dev`: the server in development mode (development auth headers on
// localhost only, so the researcher UI works without a login) and the demo
// study in an empty database.
process.env.AUTH_DEV_MODE ??= "1";
process.env.ANNOTINDER_DEMO ??= "1";
await import("./index.js");
