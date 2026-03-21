FROM node:24-slim AS build
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim AS production
RUN apt-get update && apt-get install -y --no-install-recommends docker.io && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /build/dist ./dist
COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/package.json ./package.json
COPY WORKFLOW.docker.md ./WORKFLOW.md
RUN mkdir -p /data/archives /data/workspaces && chown -R node:node /data
ENV DATA_DIR=/data
EXPOSE 4000
ENTRYPOINT ["node", "dist/cli/index.js"]
