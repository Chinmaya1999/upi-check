# Paisa API image. Build context is the repo root (the API imports the shared @upi/core engine).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY backend/package.json backend/
RUN npm ci -w backend --include-workspace-root
COPY packages/core packages/core
COPY backend backend
RUN npm run build -w backend

FROM node:22-alpine
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/paisa.db NODE_NO_WARNINGS=1
WORKDIR /app
COPY --from=build /app/backend/dist/server.mjs ./server.mjs
RUN mkdir -p /data /backups && chown node:node /data /backups
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:3000/health >/dev/null || exit 1
CMD ["node", "server.mjs"]
