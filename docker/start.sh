#!/bin/sh
# Refresh the Kobo data every hour in the background, then start the server.
# Needs KOBO_TOKEN (or kobo_token); without it the last data is kept.
(
  while true; do
    python3 /app/fetch_data.py || echo "data refresh failed - keeping the last data"
    sleep 3600
  done
) &
exec node /app/server/index.js
