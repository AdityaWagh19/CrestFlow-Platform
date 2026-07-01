# ─── Builder stage ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.base.json ./

# Copy package manifests
COPY packages/shared/package.json packages/shared/
COPY apps/copilot-api/package.json apps/copilot-api/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared/ packages/shared/
COPY apps/copilot-api/ apps/copilot-api/

# Generate Prisma client
RUN pnpm --filter copilot-api prisma generate

# Build
RUN pnpm turbo run build --filter=copilot-api

# ─── Production stage ────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Non-root user for security
RUN addgroup --system crestflow && adduser --system --ingroup crestflow crestflow

WORKDIR /app

# Copy production dependencies and built output
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/apps/copilot-api/dist ./apps/copilot-api/dist
COPY --from=builder /app/apps/copilot-api/package.json ./apps/copilot-api/
COPY --from=builder /app/apps/copilot-api/prisma ./apps/copilot-api/prisma
COPY --from=builder /app/apps/copilot-api/node_modules/.prisma ./apps/copilot-api/node_modules/.prisma

USER crestflow

EXPOSE 3000

CMD ["node", "apps/copilot-api/dist/server.js"]
