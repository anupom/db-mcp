FROM node:20-alpine AS build

WORKDIR /app

# Cache-bust: force Railway to rebuild instead of replaying stale cache
ARG CACHEBUST=1
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

# Inline nginx config (avoids needing a separate template file in the build context)
RUN printf 'server {\n\
    listen ${PORT};\n\
    server_name localhost;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
\n\
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {\n\
        expires 1y;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
}\n' > /etc/nginx/templates/default.conf.template

ENV PORT=80
EXPOSE 80
