"""Static file server for the dashboard (stdlib only - nothing to install).
Data files are sent with no-cache so hourly refreshes show straight away."""
import http.server
import os

ROOT = "/srv/www"
PORT = int(os.environ.get("PORT", "80"))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
                      ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
                      ".html": "text/html"}

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        if self.path.startswith("/data/") or self.path in ("/", "/index.html"):
            self.send_header("Cache-Control", "no-cache")
        elif self.path.startswith("/assets/"):
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        super().end_headers()

    def log_message(self, *args):  # keep container logs quiet
        pass


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
