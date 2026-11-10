# Field Team Dashboard - container image (used by ERITAS hosting).
# Stage 1 builds the React app for the site root; stage 2 serves it with
# Python's built-in web server and refreshes the Kobo data every hour.

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# seed the build with the data snapshot committed in the repo
RUN mkdir -p public/data && cp data/*.json public/data/
# served from the root of its own subdomain (GitHub Pages uses a sub-path)
ENV BASE_PATH=/
RUN npm run build

FROM python:3.12-alpine
COPY --from=build /app/dist /srv/www
COPY fetch_data.py /app/fetch_data.py
COPY docker/serve.py /app/serve.py
COPY docker/start.sh /start.sh
RUN chmod +x /start.sh
EXPOSE 80
CMD ["/start.sh"]
