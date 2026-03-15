# Caravan Coordinator - Multi-stage build from Turborepo monorepo
# Builds the React coordinator app with Electrum/Fulcrum support

FROM node:24-alpine AS builder

RUN apk add --no-cache git

# Upgrade npm to 11.x (required by project)
RUN npm install -g npm@11.5.1

WORKDIR /app

COPY . .

# Install dependencies (entire monorepo)
RUN npm ci

# Build all packages including coordinator app using turbo
RUN npm run build

# Runtime - serve with nginx
FROM nginx:alpine

RUN apk add --no-cache wget

# Copy built coordinator from builder
COPY --from=builder /app/apps/coordinator/build /usr/share/nginx/html

# Default nginx config for SPA routing
RUN echo 'server { \
  listen 80; \
  server_name _; \
  location / { \
    root /usr/share/nginx/html; \
    try_files $uri $uri/ /index.html; \
  } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
