# Field Team Dashboard - ERITAS container (login version).
# Stage 1 builds the React app in login mode; stage 2 runs the Node server
# (sign-in, role-scoped data API, user management) and refreshes the Kobo
# data every hour with fetch_data.py.

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# login mode, served from the root of its own subdomain; no data files in the site
ENV VITE_AUTH=1 BASE_PATH=/
RUN rm -rf public/data && npm run build && rm -rf dist/data
# last data snapshot from the repo (if any) so the dashboard has data before the first fetch
RUN mkdir -p /seed && (cp data/*.json /seed/ 2>/dev/null || true)

FROM node:20-alpine
RUN apk add --no-cache python3
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev
COPY server/ ./server/
COPY fetch_data.py ./fetch_data.py
COPY --from=build /app/dist ./dist
COPY --from=build /seed ./data
COPY docker/start.sh /start.sh
RUN chmod +x /start.sh && chown -R node:node /app/data
USER node
ENV NODE_ENV=production DATA_DIR=/app/data DIST_DIR=/app/dist PORT=8080
EXPOSE 8080
CMD ["/start.sh"]
