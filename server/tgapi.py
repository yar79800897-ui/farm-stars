import json
import os
import urllib.error
import urllib.request

BOT_TOKEN = os.environ.get("BOT_TOKEN", "").strip()
API_URL = "https://api.telegram.org/bot{}/{}"


def call(method, payload=None, timeout=20):
    if not BOT_TOKEN:
        return {"ok": False, "description": "BOT_TOKEN is not set"}
    body = json.dumps(payload or {}).encode("utf-8")
    request = urllib.request.Request(
        API_URL.format(BOT_TOKEN, method),
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            return json.loads(exc.read().decode("utf-8"))
        except Exception:
            return {"ok": False, "description": "http_{}".format(exc.code)}
    except Exception as exc:
        return {"ok": False, "description": str(exc)}


def create_invoice_link(title, description, payload, stars):
    """Счёт в Telegram Stars (валюта XTR)."""
    return call("createInvoiceLink", {
        "title": title,
        "description": description,
        "payload": payload,
        "currency": "XTR",
        "prices": [{"label": "{} Stars".format(stars), "amount": stars}],
    })


def answer_pre_checkout(query_id, ok=True, error=""):
    body = {"pre_checkout_query_id": query_id, "ok": ok}
    if not ok:
        body["error_message"] = error or "Оплата недоступна"
    return call("answerPreCheckoutQuery", body)


def set_webhook(url, secret):
    return call("setWebhook", {
        "url": url,
        "secret_token": secret,
        "allowed_updates": ["message", "pre_checkout_query"],
        "drop_pending_updates": True,
    })
