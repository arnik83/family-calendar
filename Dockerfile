# Build the React client.
FROM oven/bun:1.3 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY client ./client
COPY tsconfig.base.json ./
RUN bun run build

# Runtime: Bun server + built client. Data lives in /data (a volume).
FROM oven/bun:1.3-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile
COPY server ./server
COPY drizzle ./drizzle
COPY --from=build /app/client/dist ./client/dist
VOLUME /data
EXPOSE 3000
CMD ["bun", "server/src/index.ts"]
