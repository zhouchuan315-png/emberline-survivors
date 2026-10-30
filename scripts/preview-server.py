#!/usr/bin/env python3
"""Serve the Cocos web export without browser caching during local playtests."""

from __future__ import annotations

import argparse
import re
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit


class NoCacheHandler(SimpleHTTPRequestHandler):
    """Keep local playtest responses fresh while preserving normal MIME handling."""

    def send_head(self):
        url = urlsplit(self.path)
        if url.path in ("/", "/index.html"):
            location = urlunsplit(("", "", self.server.preview_prefix, url.query, ""))
            self.send_response(307)
            self.send_header("Location", location)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None
        # Always return current bytes, including requests from old cached pages.
        for header in ("If-Modified-Since", "If-None-Match"):
            if header in self.headers:
                del self.headers[header]
        return super().send_head()

    def translate_path(self, path: str) -> str:
        # A fresh URL namespace bypasses already-cached JS, JSON, and textures.
        # Keep old preview links valid; responses still use no-store.
        url = urlsplit(path)
        relative = re.sub(r"^/__preview/[0-9a-f]+/", "/", url.path)
        return super().translate_path(urlunsplit(("", "", relative, url.query, "")))

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--directory", default=str(Path(__file__).resolve().parents[1] / "build/web-desktop"))
    args = parser.parse_args()
    if not (Path(args.directory) / "index.html").is_file():
        parser.error("Web export missing. Run npm run build first.")

    handler = partial(NoCacheHandler, directory=args.directory)
    server = ThreadingHTTPServer((args.bind, args.port), handler)
    server.preview_prefix = f"/__preview/{time.time_ns():x}/"
    print(f"Serving {args.directory} at http://{args.bind}:{args.port}{server.preview_prefix} (no cache)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
