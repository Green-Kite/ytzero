# ---- build UI ----
FROM oven/bun:1.3 AS ui-build
WORKDIR /ui
COPY ui/package.json ui/bun.lock* ./
RUN bun install
COPY ui/ .
RUN bun run build

# ---- runtime ----
FROM oven/bun:1.3-slim
WORKDIR /app
COPY app/package.json app/bun.lock* ./
RUN bun install --production
COPY app/src ./src
COPY --from=ui-build /ui/dist ./public

ENV PORT=3001 \
    DB_PATH=/data/db/ytzero.db \
    IMG_CACHE_DIR=/data/imgcache \
    UI_DIST=./public

VOLUME /data
EXPOSE 3001
CMD ["bun", "src/index.ts"]
