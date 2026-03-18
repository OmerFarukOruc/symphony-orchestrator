FROM node:22-slim AS build
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim AS production
WORKDIR /app
COPY --from=build /build/dist ./dist
COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/package.json ./package.json
COPY WORKFLOW.docker.md ./WORKFLOW.md
ENV DATA_DIR=/data
EXPOSE 4000
USER node
ENTRYPOINT ["node", "dist/cli.js"]
