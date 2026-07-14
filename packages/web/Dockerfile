# Build context is the repo root (see docker-compose.yml).
FROM node:20-alpine AS base
WORKDIR /app

# ---- deps: full workspace install so npm creates all node_modules + bins ----
FROM base AS deps
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
COPY packages/simulator/package.json packages/simulator/
RUN npm install

# ---- build (from deps, so node_modules are present) ----
FROM deps AS build
COPY packages/web packages/web
# NEXT_PUBLIC_* must be present at build time to be inlined into the bundle.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build --workspace @roster/web

# ---- runtime (Next.js standalone) ----
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/packages/web/.next/standalone ./
COPY --from=build /app/packages/web/.next/static ./packages/web/.next/static
COPY --from=build /app/packages/web/public ./packages/web/public
EXPOSE 3000
CMD ["node", "packages/web/server.js"]
