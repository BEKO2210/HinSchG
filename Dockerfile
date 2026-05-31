# HinSchG — Multi-Stage Build fuer die Next.js-App
# Nutzt den "standalone"-Output (siehe next.config.mjs) fuer ein schlankes Runtime-Image.

# ---- Stage 1: Dependencies --------------------------------------------------
FROM node:20-alpine AS deps
# libc6-compat wird von einigen nativen Modulen unter Alpine benoetigt.
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---- Stage 2: Build ---------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Phase 0: Schema ist leer, daher kein `prisma generate` (folgt mit den Modellen
# in Phase 1). Nur validieren und bauen.
ENV NEXT_TELEMETRY_DISABLED=1
# Platzhalter nur fuer Build-Zeit-Validierung/Build; zur Laufzeit kommt der echte
# Wert via docker-compose/Environment.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
RUN npx prisma validate
RUN npm run build

# ---- Stage 3: Runtime -------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Nicht als root laufen.
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Standalone-Server + statische Assets aus dem Build uebernehmen.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Prisma-Schema fuer Migrationen/Validierung im Container.
COPY --from=builder /app/prisma ./prisma

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
