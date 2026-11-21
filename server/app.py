import json
import mimetypes
import os
import posixpath
import secrets
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import store
import tgauth
import tgapi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get("PORT", "8080"))
ALLOW_GUEST = os.environ.get("ALLOW_GUEST", "1") == "1"
DEV_MODE = os.environ.get("DEV_MODE", "0") == "1"
MAX_BODY = 64 * 1024
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET") or ("devsecret" if DEV_MODE else secrets.token_hex(16))


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
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/"):
            return self._api_get(parsed.path, urllib.parse.parse_qs(parsed.query))
        return self._static(parsed.path)

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        return self._api_post(path)

    def _api_get(self, path, query=None):
        query = query or {}
        if path == "/api/health":
            return self._json(200, {
                "ok": True,
                "gifts": len(store.CATALOGUE),
                "auth": bool(tgauth.BOT_TOKEN),
                "guest": ALLOW_GUEST,
                "db": store.backend_name(),
            })

        if path == "/api/me":
            uid, row = self._identity()
            if row is None:
                return self._json(401, {"error": "unauthorized"})
            payload = store.user_public(row)
            payload["inventory"] = store.inventory_of(uid)
            return self._json(200, payload)

        if path == "/api/diag":
            try:
                store.ensure_user("diag:probe", "Диагностика", "")
                store.backend().query("UPDATE users SET xp=xp+1 WHERE uid=?", ("diag:probe",))
                rows = store.backend().query(
                    "SELECT uid, xp, stars, coins FROM users WHERE uid=?", ("diag:probe",))
                return self._json(200, {
                    "db": store.backend_name(),
                    "user": rows[0] if rows else None,
                })
            except Exception as exc:
                return self._json(500, {"db": "unknown", "error": str(exc)})

        if path == "/api/checkers/game":
            uid, row = self._identity()
            if row is None:
                return self._json(401, {"error": "unauthorized"})
            try:
                game_id = int((query.get("id") or ["0"])[0])
            except (TypeError, ValueError):
                return self._json(400, {"error": "bad_id"})
            status, payload = store.checkers_game_state(uid, game_id)
            return self._json(status, payload)

        return self._json(404, {"error": "not_found"})

    def _api_post(self, path):
        if path == "/api/telegram/webhook":
            return self._webhook()

        if path.startswith("/api/checkers/"):
            uid, row = self._identity()
            if row is None:
                return self._json(401, {"error": "unauthorized"})
            data = self._body()

            if path == "/api/checkers/start":
                status, payload = store.start_checkers(
                    uid, row.get("name") or "Игрок", data.get("bet"), data.get("minutes"))
                return self._json(status, payload)

            try:
                game_id = int(data.get("id") or 0)
            except (TypeError, ValueError):
                return self._json(400, {"error": "bad_id"})

            if path == "/api/checkers/bot":
                status, payload = store.attach_checkers_bot(uid, game_id)
            elif path == "/api/checkers/move":
                status, payload = store.checkers_move(uid, game_id, data.get("from"), data.get("to"))
            elif path == "/api/checkers/resign":
                status, payload = store.checkers_resign(uid, game_id)
            elif path == "/api/checkers/draw":
                status, payload = store.checkers_draw(uid, game_id)
            elif path == "/api/checkers/cancel":
                status, payload = store.checkers_cancel(uid, game_id)
            else:
                return self._json(404, {"error": "not_found"})
            return self._json(status, payload)

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

        if path == "/api/wheel/spin":
            uid, row = self._identity()
            if row is None:
                return self._json(401, {"error": "unauthorized"})
            status, payload = store.wheel_spin(uid)
            return self._json(status, payload)

        if path == "/api/farm/sell":
            uid, row = self._identity()
            if row is None:
                return self._json(401, {"error": "unauthorized"})
            data = self._body()
            status, payload = store.farm_sell(uid, data.get("coins"))
            return self._json(status, payload)

        if path == "/api/farm/buy":
            uid, row = self._identity()
            if row is None:
                return self._json(401, {"error": "unauthorized"})
            data = self._body()
            status, payload = store.farm_buy(uid, data.get("coins"))
            return self._json(status, payload)

        if path == "/api/invoice":
            uid, row = self._identity()
            if row is None:
                return self._json(401, {"error": "unauthorized"})
            data = self._body()
            try:
                stars = int(data.get("stars"))
            except (TypeError, ValueError):
                return self._json(400, {"error": "bad_amount"})
            if stars < 10 or stars > 100000:
                return self._json(400, {"error": "bad_amount"})

            payload = "{}:{}".format(uid, secrets.token_hex(8))
            result = tgapi.create_invoice_link(
                "Farm Stars",
                "Пополнение баланса на {} ⭐".format(stars),
                payload,
                stars,
            )
            if not result.get("ok"):
                return self._json(502, {
                    "error": "telegram",
                    "description": result.get("description", "telegram error")
                })

            store.create_invoice(uid, stars, payload)
            return self._json(200, {"link": result.get("result"), "stars": stars})

        if path == "/api/dev/grant" and DEV_MODE:
            uid, row = self._identity()
            if row is None:
                return self._json(401, {"error": "unauthorized"})
            data = self._body()
            status, payload = store.dev_grant(uid, int(data.get("stars") or 0), int(data.get("coins") or 0))
            return self._json(status, payload)

        return self._json(404, {"error": "not_found"})

    def _webhook(self):
        if self.headers.get("X-Telegram-Bot-Api-Secret-Token", "") != WEBHOOK_SECRET:
            return self._json(403, {"error": "forbidden"})

        update = self._body()
        if not update:
            return self._json(400, {"error": "bad_update"})

        if "pre_checkout_query" in update:
            query = update.get("pre_checkout_query") or {}
            invoice = store.invoice_by_payload(query.get("invoice_payload", ""))
            if invoice is None:
                tgapi.answer_pre_checkout(query.get("id"), ok=False, error="Счёт не найден")
            else:
                tgapi.answer_pre_checkout(query.get("id"), ok=True)
            return self._json(200, {"ok": True})

        payment = (update.get("message") or {}).get("successful_payment")
        if payment:
            store.mark_invoice_paid(
                payment.get("invoice_payload", ""),
                payment.get("telegram_payment_charge_id", "")
            )
        return self._json(200, {"ok": True})

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


def register_webhook():
    public = (os.environ.get("PUBLIC_URL") or os.environ.get("RENDER_EXTERNAL_URL") or "").rstrip("/")
    if not public or not tgapi.BOT_TOKEN:
        return
    result = tgapi.set_webhook(public + "/api/telegram/webhook", WEBHOOK_SECRET)
    print("webhook: {} -> ok={} {}".format(
        public, result.get("ok"), result.get("description", "")))


class Server(ThreadingHTTPServer):
    daemon_threads = True
    # по умолчанию очередь входящих соединений всего 5 — на всплеске браузеры
    # получают отказ, поэтому поднимаем её
    request_queue_size = 128


def main():
    os.chdir(ROOT)
    httpd = Server(("0.0.0.0", PORT), Handler)
    print("Farm Stars server on http://0.0.0.0:{} (gifts: {}, bot token: {})".format(
        PORT, len(store.CATALOGUE), "yes" if tgauth.BOT_TOKEN else "no"))
    try:
        print("db backend:", store.backend_name())
    except Exception as exc:
        print("db backend error:", exc)
    register_webhook()
    httpd.serve_forever()


if __name__ == "__main__":
    main()
