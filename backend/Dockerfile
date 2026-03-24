# ── Stage 1: Build ────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# ── Stage 2: Runtime ──────────────────────────────────
FROM node:20-alpine AS runtime

RUN apk add --no-cache curl dumb-init && \
    addgroup -g 1001 -S ciphercloud && \
    adduser  -u 1001 -S ciphercloud -G ciphercloud

WORKDIR /app

COPY --from=builder --chown=ciphercloud:ciphercloud /app/node_modules ./node_modules
COPY --chown=ciphercloud:ciphercloud src/ ./src/
COPY --chown=ciphercloud:ciphercloud package.json ./

USER ciphercloud
EXPOSE 3000
ENV NODE_ENV=production PORT=3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "src/server.js"]

# ═══════════════════════════════════════════════════════
# SECUREVAULT — BACKEND DOCKERFILE
# File: C:\Projects\securevault\backend\Dockerfile
# ═══════════════════════════════════════════════════════

# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install system dependencies needed for crypto operations
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    openssl

# Copy package files first (for better layer caching)
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create uploads directory
RUN mkdir -p uploads/files uploads/blocks uploads/stego

# Create non-root user for security
RUN addgroup -g 1001 -S securevault && \
    adduser -S -u 1001 -G securevault securevault && \
    chown -R securevault:securevault /app

# Switch to non-root user
USER securevault

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "src/server.js"]
