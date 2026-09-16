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

# DeepSeek API key for the boards' AI panel. Injected into the /ai/ proxy
# location via envsubst at container start — the key never reaches the
# browser. Leave empty to disable AI entirely (the panel will show 401
# errors on send, and the user can still point the panel at a direct
# endpoint in its settings).
ENV DEEPSEEK_API_KEY=

EXPOSE 80