# AnnoTinder: the server, serving the built client (docs/hosting.md).
#   docker build -t annotinder .

FROM node:22-slim AS build
RUN corepack enable
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @annotinder/contracts build \
  && pnpm --filter @annotinder/server build \
  && pnpm --filter @annotinder/client exec vite build --config vite.config.ts \
  && pnpm --filter @annotinder/server deploy --prod --legacy /out

FROM node:22-slim
WORKDIR /app
COPY --from=build /out ./
COPY --from=build /src/packages/client/dist ./client
ENV NODE_ENV=production \
    PORT=8787 \
    ANNOTINDER_CLIENT_DIR=/app/client
USER node
EXPOSE 8787
HEALTHCHECK CMD node -e "fetch('http://localhost:8787/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "dist/index.js"]
