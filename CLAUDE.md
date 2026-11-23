# Working on AnnoTinder

## Tests

- **Don't run the end-to-end tests (`packages/e2e`, Playwright) by default.**
  They take minutes. Run them only when asked, or after a long job that
  really affects what they cover (a change across the coding flow, the
  editor or the server runtime) — then once, at the end.
- The fast checks after a change:
  - `pnpm -r lint`
  - contracts: `cd packages/contracts && pnpm build && pnpm test`
  - server: `cd packages/server && npx tsc --noEmit -p . && pnpm test`
  - client: `cd packages/client && npx tsc --noEmit -p tsconfig.app.json && pnpm test`
    (the client's root tsconfig checks no files; use `tsconfig.app.json`)
