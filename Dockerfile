# Multi-stage build for backend
FROM node:18-alpine AS backend-builder

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend .
RUN npm run build

# Multi-stage build for frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend .
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# Final production image
FROM node:18-alpine

RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy backend
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules
COPY --from=backend-builder /app/backend/package*.json ./backend/

# Copy frontend
COPY --from=frontend-builder /app/frontend/.next ./frontend/.next
COPY --from=frontend-builder /app/frontend/node_modules ./frontend/node_modules
COPY --from=frontend-builder /app/frontend/package*.json ./frontend/
COPY --from=frontend-builder /app/frontend/public ./frontend/public

EXPOSE 3000 3001

ENV NODE_ENV production

ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Default to running backend
CMD ["node", "backend/dist/main.js"]
