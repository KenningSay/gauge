FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# WebDAV backend the app talks to. Must be a full URL, path included,
# ending in a slash — e.g. https://cloud.example.com/remote.php/dav/files/you/
ENV WEBDAV_TARGET=http://localhost

# DeepSeek API key for the boards' AI panel — YOUR OWN key goes here, at
# run time, never baked into an image or committed. Pass it with
# `docker run -e DEEPSEEK_API_KEY=sk-...` or via docker-compose.yml.
#
# It is injected into the /ai/ proxy location by envsubst at container
# start, so nginx adds the Authorization header server-side and the key
# never reaches the browser — no bundle, no network tab, no sessionStorage.
#
# Leave it empty to disable AI entirely: the panel then answers with a 401
# on send, and the user can still point it at a direct endpoint with their
# own key in the panel's settings. See README.md, "AI (DeepSeek, optional)".
ENV DEEPSEEK_API_KEY=

# DNS server nginx uses to resolve api.deepseek.com at request time (see
# nginx.conf.template for why resolution is deferred). The default is
# Docker's embedded resolver; override it if you run this outside Docker.
ENV DNS_RESOLVER=127.0.0.11

EXPOSE 80