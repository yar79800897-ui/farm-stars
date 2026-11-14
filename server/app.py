import json
import mimetypes
import os
import posixpath
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import store
import tgauth

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get("PORT", "8080"))
ALLOW_GUEST = os.environ.get("ALLOW_GUEST", "1") == "1"
DEV_MODE = os.environ.get("DEV_MODE", "0") == "1"
MAX_BODY = 64 * 1024


class Handler(BaseHTTPRequestHandler):
    server_version = "FarmStars/1.0"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    # ---------- утилиты ----------

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Init-Data, X-Device-Id")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return {}
        if length <= 0 or length > MAX_BODY:
            return {}
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return {}
        return data if isinstance(data, dict) else {}

    def _identity(self):
        """Возвращает uid и имя: сначала Telegram, иначе гость по device id."""
        user = tgauth.validate(self.headers.get("X-Init-Data", ""))
        if user:
            uid = "tg:{}".format(user["id"])
            name = (user["first_name"] + " " + user["last_name"]).strip() or "Фермер"
            row = store.ensure_user(uid, name, user["username"])
            return uid, row

        if not ALLOW_GUEST:
            return None, None

        device = (self.headers.get("X-Device-Id") or "").strip()[:64]
        if not device:
            return None, None
        uid = "guest:" + device
        row = store.ensure_user(uid, "Гость", "")
        return uid, row

    # ---------- маршруты ----------

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path.startswith("/api/"):
            return self._api_get(path)
        return self._static(path)

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        return self._api_post(path)

    def _api_get(self, path):
        if path == "/api/health":
            return self._json(200, {
                "ok": True,
                "gifts": len(store.CATALOGUE),
                "auth": bool(tgauth.BOT_TOKEN),
                "guest": ALLOW_GUEST,
            })

        if path == "/api/me":
            uid, row = self._identity()
            if row is None:
                return self._json(401, {"error": "unauthorized"})
            payload = store.user_public(row)
            payload["inventory"] = store.inventory_of(uid)
            return self._json(200, payload)

        return self._json(404, {"error": "not_found"})

    def _api_post(self, path):
        if path == "/api/spin":
            uid, row = self._identity()
            if row is None:
                return self._json(401, {"error": "unauthorized"})
            data = self._body()
            status, payload = store.spin(uid, data.get("gift"), data.get("chance"))
            return self._json(status, payload)

        if path == "/api/promo":
            uid, row = self._identity()
            if row is None:
                return self._json(401, {"error": "unauthorized"})
            data = self._body()
            status, payload = store.apply_promo(uid, data.get("code"))
            return self._json(status, payload)

        if path == "/api/inventory/withdraw":
            uid, row = self._identity()
            if row is None:
                return self._json(401, {"error": "unauthorized"})
            data = self._body()
            status, payload = store.withdraw(uid, data.get("id"))
            return self._json(status, payload)

        if path == "/api/exchange":
            uid, row = self._identity()
            if row is None:
                return self._json(401, {"error": "unauthorized"})
            data = self._body()
            status, payload = store.exchange(uid, data.get("coins"))
            return self._json(status, payload)

        if path == "/api/dev/grant" and DEV_MODE:
            uid, row = self._identity()
            if row is None:
                return self._json(401, {"error": "unauthorized"})
            data = self._body()
            status, payload = store.dev_grant(uid, int(data.get("stars") or 0), int(data.get("coins") or 0))
            return self._json(status, payload)

        return self._json(404, {"error": "not_found"})

    # ---------- статика ----------

    def _static(self, path):
        if path == "/":
            path = "/index.html"
        clean = posixpath.normpath(urllib.parse.unquote(path))
        if clean.startswith("..") or clean.startswith("/../"):
            return self._json(404, {"error": "not_found"})

        full = os.path.join(ROOT, clean.lstrip("/"))
        if not os.path.isfile(full):
            return self._json(404, {"error": "not_found"})

        ctype, _ = mimetypes.guess_type(full)
        ctype = ctype or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"

        with open(full, "rb") as handle:
            data = handle.read()

        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        if full.startswith(os.path.join(ROOT, "assets")):
            self.send_header("Cache-Control", "public, max-age=604800")
        else:
            self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)


def main():
    os.chdir(ROOT)
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print("Farm Stars server on http://0.0.0.0:{} (gifts: {}, bot token: {})".format(
        PORT, len(store.CATALOGUE), "yes" if tgauth.BOT_TOKEN else "no"))
    httpd.serve_forever()


if __name__ == "__main__":
    main()
