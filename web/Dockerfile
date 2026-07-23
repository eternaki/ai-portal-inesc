FROM node:22-alpine AS base
RUN corepack enable pnpm && corepack prepare pnpm@10.0.0 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml* .npmrc ./
RUN mkdir -p /scripts && printf "process.exit(0)\n" > /scripts/setup-hooks.mjs
RUN pnpm install --frozen-lockfile || pnpm install

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build does not query the database: dynamic pages render at request time.
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
