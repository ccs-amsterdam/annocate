# AnnoTinder: the server, serving the built client (docs/hosting.md). CI
# publishes it as ghcr.io/ccs-amsterdam/annotinder (.github/workflows/image.yml).
#   docker build -t annotinder --build-arg ANNOTINDER_COMMIT=$(git rev-parse --short=8 HEAD) .

# The build runs on the builder's own platform, also for an image of another
# one (arm64 on an amd64 runner): its output is JavaScript, and the server's
# production dependencies have no native code, so the final stage only copies.
FROM --platform=$BUILDPLATFORM node:22-slim AS build
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
  && pnpm --filter @annotinder/client exec vite build \
  && pnpm --filter @annotinder/server deploy --prod --legacy /out

FROM node:22-slim
# The commit this image is built from: recorded with each deployment (docs/hosting.md)
ARG ANNOTINDER_COMMIT=unknown
WORKDIR /app
COPY --from=build /out ./
COPY --from=build /src/packages/client/dist ./client
ENV NODE_ENV=production \
    PORT=8787 \
    ANNOTINDER_CLIENT_DIR=/app/client \
    ANNOTINDER_COMMIT=$ANNOTINDER_COMMIT
USER node
EXPOSE 8787
HEALTHCHECK CMD node -e "fetch('http://localhost:8787/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "dist/index.js"]
