# Build context is the repo root (see docker-compose.yml), so workspace
# packages like @roster/shared resolve during install.
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

# ---- runtime: start from deps (node_modules already in place) + source ----
# .dockerignore excludes node_modules, so copying source never clobbers deps.
FROM deps AS runtime
ENV NODE_ENV=production
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/api packages/api
EXPOSE 8080
# tsx runs TypeScript directly; run through the workspace so its bin resolves.
CMD ["npm", "run", "start", "--workspace", "@roster/api"]
