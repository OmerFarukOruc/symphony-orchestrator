FROM node:24-slim AS build
WORKDIR /build
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/backend/package.json packages/backend/package.json
COPY packages/frontend/package.json packages/frontend/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @symphony/shared build && \
    pnpm --filter @symphony/backend build && \
    pnpm --filter @symphony/frontend build

FROM node:24-slim AS production
RUN apt-get update && apt-get install -y --no-install-recommends docker.io && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /build/dist ./dist
COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/packages ./packages
COPY --from=build /build/package.json ./package.json
COPY --from=build /build/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build /build/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY WORKFLOW.docker.md ./WORKFLOW.md
RUN mkdir -p /data/archives /data/workspaces && chown -R node:node /data
ENV DATA_DIR=/data
EXPOSE 4000
USER node
ENTRYPOINT ["node", "dist/cli/index.js"]
