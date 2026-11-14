import hashlib
import hmac
import json
import os
import time
import urllib.parse

BOT_TOKEN = os.environ.get("BOT_TOKEN", "").strip()
MAX_AGE = int(os.environ.get("INITDATA_MAX_AGE", "86400"))


def _parse(raw):
    data = {}
    for part in raw.split("&"):
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        data[urllib.parse.unquote(key)] = urllib.parse.unquote(value)
    return data


def _check_string(data, skip):
    pairs = ["{}={}".format(key, value) for key, value in data.items() if key not in skip]
    return "\n".join(sorted(pairs))


def _digest(bot_token, check_string):
    secret = hmac.new(b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256).digest()
    return hmac.new(secret, check_string.encode("utf-8"), hashlib.sha256).hexdigest()


def validate(raw_init_data):
    """Проверяет подпись initData и возвращает данные пользователя или None."""
    if not raw_init_data or not BOT_TOKEN:
        return None

    data = _parse(raw_init_data)
    received_hash = data.pop("hash", "")
    if not received_hash:
        return None

    candidates = [_check_string(data, {"hash"}), _check_string(data, {"hash", "signature"})]
    matched = any(hmac.compare_digest(_digest(BOT_TOKEN, text), received_hash) for text in candidates)
    if not matched:
        return None

    try:
        auth_date = int(data.get("auth_date", "0") or 0)
    except ValueError:
        auth_date = 0
    if auth_date and time.time() - auth_date > MAX_AGE:
        return None

    try:
        user = json.loads(data.get("user", "{}") or "{}")
    except json.JSONDecodeError:
        user = {}
    if not isinstance(user, dict) or not user.get("id"):
        return None

    return {
        "id": int(user["id"]),
        "first_name": user.get("first_name", ""),
        "last_name": user.get("last_name", ""),
        "username": user.get("username", ""),
    }
