#!/bin/sh
# Refresh the Kobo data every hour in the background, then serve the site.
# Needs KOBO_TOKEN (or kobo_token) in the environment; without it the
# dashboard keeps serving the snapshot baked into the image.
export DATA_DIR=/srv/www/data
(
  while true; do
    python /app/fetch_data.py || echo "data refresh failed - keeping the last data"
    sleep 3600
  done
) &
exec python /app/serve.py
