# Build the React client.
FROM oven/bun:1.3 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY client ./client
COPY tsconfig.base.json ./
RUN bun run build

# Runtime: Bun server + built client. Data lives in /data (a volume).
# node_modules is copied from the build stage instead of reinstalled, so the
# runtime uses exactly the dependency tree that was built and tested above.
FROM oven/bun:1.3-slim
WORKDIR /app
ENV PORT=3000 \
    DATA_DIR=/data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/bun.lock ./bun.lock
COPY server ./server
COPY drizzle ./drizzle
COPY --from=build /app/client/dist ./client/dist
VOLUME /data
EXPOSE 3000
CMD ["bun", "server/src/index.ts"]
