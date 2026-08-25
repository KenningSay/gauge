# --- build ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- serve ---
# Plain nginx:alpine, not a custom entrypoint script: the official image
# already substitutes ${VARS} in any *.template file under
# /etc/nginx/templates/ into /etc/nginx/conf.d/ from the real environment at
# container start (docker-entrypoint.d/20-envsubst-on-templates.sh) — that's
# how WEBDAV_TARGET below reaches nginx.conf.template without a hand-rolled
# envsubst wrapper.
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Dummy default so the container starts (and shows the login screen) even
# without -e WEBDAV_TARGET=... — it just can't reach a real server until you
# set it to your own WebDAV endpoint.
ENV WEBDAV_TARGET=http://localhost

EXPOSE 80
