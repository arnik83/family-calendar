# Runtime image. Dependencies and the client bundle are built in CI
# (see .github/workflows/docker-publish.yml) and copied in — no package
# installation happens inside the image.
FROM oven/bun:1.3-slim
WORKDIR /app
ENV PORT=3000 \
    DATA_DIR=/data
COPY package.json bun.lock ./
COPY node_modules ./node_modules
COPY client/dist ./client/dist
COPY server ./server
COPY drizzle ./drizzle
VOLUME /data
EXPOSE 3000
CMD ["bun", "server/src/index.ts"]
