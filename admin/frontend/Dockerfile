FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
# VITE_API_URL is baked into the JS bundle at build time.
# Railway passes env vars as Docker build args automatically.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.sh /custom-entrypoint.sh
RUN chmod +x /custom-entrypoint.sh

# Default backend host for Docker Compose; override for Railway
ENV BACKEND_HOST=db-mcp:3000
# PORT defaults to 80 (Docker Compose); Railway overrides with its own PORT
ENV PORT=80

EXPOSE 80

# Custom entrypoint extracts DNS resolver, then delegates to nginx entrypoint
ENTRYPOINT ["/custom-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
