FROM node:24-alpine AS frontend
ENV CI=true
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npx ng build --configuration production

FROM node:24-alpine AS backend-deps
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    TZ=Asia/Bangkok
RUN apk add --no-cache tzdata
WORKDIR /app
COPY CSV/ ./CSV/
COPY --from=backend-deps /app/backend/node_modules ./backend/node_modules
COPY backend/package.json ./backend/package.json
COPY backend/src ./backend/src
COPY backend/fonts ./backend/fonts
COPY backend/assets ./backend/assets
COPY backend/data ./backend/data
COPY --from=frontend /app/frontend/dist ./frontend/dist
RUN mkdir -p /app/backend/output && chown -R node:node /app/backend/data /app/backend/output
USER node
WORKDIR /app/backend
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "src/server.js"]
