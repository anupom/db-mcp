FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Default backend host for Docker Compose; override for Railway
ENV BACKEND_HOST=db-mcp:3000

EXPOSE 80

# nginx:alpine image auto-runs envsubst on /etc/nginx/templates/*.template
# and outputs to /etc/nginx/conf.d/ before starting nginx
CMD ["nginx", "-g", "daemon off;"]
