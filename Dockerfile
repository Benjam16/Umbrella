# Umbrella agent — multi-stage build (Milestone 3)
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/bin ./bin
COPY --from=build /app/modules ./modules
COPY --from=build /app/runtime ./runtime
COPY --from=build /app/examples ./examples
COPY --from=build /app/docs ./docs
COPY --from=build /app/README.md ./README.md
COPY --from=build /app/FEATURES.md ./FEATURES.md
COPY --from=build /app/LICENSE ./LICENSE
COPY --from=build /app/.env.umbrella.example ./.env.umbrella.example

EXPOSE 4578
# LLM keys, TELEGRAM_BOT_TOKEN, DISCORD_BOT_TOKEN, UMBRELLA_DASHBOARD_PORT, MCP, etc.
CMD ["node", "dist/runtime/index.js"]
