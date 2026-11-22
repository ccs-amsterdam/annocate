# @annotinder/client

The AnnoTinder web app (React 19, Vite, Tailwind 4): the coding screen
coders use (`/code`) and the researcher UI (`/research`). The server serves
the built app.

```sh
pnpm dev            # from the repo root: client on :5173, server on :8787
pnpm --filter @annotinder/client test
pnpm --filter @annotinder/client lint   # ESLint
```

How it works: [docs/client.md](../../docs/client.md).

## Code

- `src/lib/studyManager/`, `src/lib/components/StudyRunner.tsx`: the coding
  runtime.
- `src/lib/codebook/`: templates, conditions, expressions, the item tree.
- `src/lib/keyboard/`: key handling and shortcut styles.
- `src/lib/components/admin/`: the researcher UI.
- `src/lib/help/topics/`: the in-app help, one Markdown file per topic
  (tested: front matter, links and examples).
