# Frontend build stage
FROM node:20-alpine AS frontend-builder

WORKDIR /app/admin/frontend

COPY admin/frontend/package.json admin/frontend/package-lock.json* ./
RUN npm ci

COPY admin/frontend/ .
RUN npm run build

# Backend build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=frontend-builder /app/admin/frontend/dist ./public

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
