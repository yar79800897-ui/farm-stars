import os
import re
import sqlite3
import threading
import time
from contextlib import contextmanager

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("DB_PATH") or os.path.join(BASE_DIR, "data.db")

START_STARS = 0
START_COINS = 0
EXCHANGE_RATE = 2000
PLUSH_RATE = 10000
FREE_SPINS = 3
PAID_SPIN_COST = 10

WHEEL_PRIZES = [
    {"text": "Пусто ❌", "type": "empty", "value": 0},
    {"text": "500 💰", "type": "coins", "value": 500},
    {"text": "Пусто ❌", "type": "empty", "value": 0},
    {"text": "20 ⭐", "type": "stars", "value": 20},
    {"text": "Пусто ❌", "type": "empty", "value": 0},
    {"text": "1000 💰", "type": "coins", "value": 1000},
    {"text": "Пусто ❌", "type": "empty", "value": 0},
    {"text": "5 ⭐", "type": "stars", "value": 5}
]

MAX_FARM_AMOUNT = 50000

_lock = threading.RLock()
_conn = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    uid TEXT PRIMARY KEY,
    name TEXT,
    username TEXT,
    stars INTEGER NOT NULL DEFAULT 0,
    coins INTEGER NOT NULL DEFAULT 0,
    xp INTEGER NOT NULL DEFAULT 0,
    wheel_date TEXT,
    wheel_used INTEGER NOT NULL DEFAULT 0,
    created INTEGER NOT NULL,
    seen INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT NOT NULL,
    gift TEXT NOT NULL,
    price INTEGER NOT NULL,
    ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS inventory_uid ON inventory(uid);

CREATE TABLE IF NOT EXISTS promos (
    code TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    amount INTEGER NOT NULL,
    max_uses INTEGER NOT NULL DEFAULT 1,
    used INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS promo_uses (
    code TEXT NOT NULL,
    uid TEXT NOT NULL,
    ts INTEGER NOT NULL,
    PRIMARY KEY (code, uid)
);

CREATE TABLE IF NOT EXISTS spins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT NOT NULL,
    gift TEXT NOT NULL,
    chance INTEGER NOT NULL,
    cost INTEGER NOT NULL,
    won INTEGER NOT NULL,
    ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS spins_uid ON spins(uid);
"""

SEED_PROMOS = [
    ("STARS10000", "stars", 10000, 100),
    ("FARMSTARS", "stars", 25, 1000),
    ("HARVEST", "coins", 50000, 1000),
]


def now():
    return int(time.time())


def conn():
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False, isolation_level=None)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.executescript(SCHEMA)

        columns = [row[1] for row in _conn.execute("PRAGMA table_info(users)")]
        if "wheel_date" not in columns:
            _conn.execute("ALTER TABLE users ADD COLUMN wheel_date TEXT")
        if "wheel_used" not in columns:
            _conn.execute("ALTER TABLE users ADD COLUMN wheel_used INTEGER NOT NULL DEFAULT 0")

        for code, kind, amount, max_uses in SEED_PROMOS:
            _conn.execute(
                "INSERT OR IGNORE INTO promos(code, kind, amount, max_uses) VALUES(?,?,?,?)",
                (code, kind, amount, max_uses),
            )
    return _conn


@contextmanager
def tx():
    db = conn()
    with _lock:
        db.execute("BEGIN IMMEDIATE")
        try:
            yield db
        except Exception:
            db.execute("ROLLBACK")
            raise
        else:
            db.execute("COMMIT")


def ensure_user(uid, name=None, username=None):
    db = conn()
    ts = now()
    with _lock:
        row = db.execute("SELECT * FROM users WHERE uid=?", (uid,)).fetchone()
        if row is None:
            db.execute(
                "INSERT INTO users(uid, name, username, stars, coins, xp, created, seen) VALUES(?,?,?,?,?,?,?,?)",
                (uid, name or "Фермер", username or "", START_STARS, START_COINS, 0, ts, ts),
            )
            row = db.execute("SELECT * FROM users WHERE uid=?", (uid,)).fetchone()
        else:
            db.execute(
                "UPDATE users SET seen=?, name=COALESCE(?, name), username=COALESCE(?, username) WHERE uid=?",
                (ts, name, username, uid),
            )
            row = db.execute("SELECT * FROM users WHERE uid=?", (uid,)).fetchone()
    return row


def today():
    return time.strftime("%Y-%m-%d", time.localtime())


def spins_left_of(row):
    used = row["wheel_used"] if row["wheel_date"] == today() else 0
    return max(0, FREE_SPINS - used)


def user_public(row):
    return {
        "id": row["uid"],
        "name": row["name"],
        "username": row["username"],
        "stars": row["stars"],
        "coins": row["coins"],
        "xp": row["xp"],
        "spins_left": spins_left_of(row) if "wheel_used" in row.keys() else FREE_SPINS,
    }


def inventory_of(uid):
    db = conn()
    rows = db.execute(
        "SELECT id, gift, price, ts FROM inventory WHERE uid=? ORDER BY id DESC", (uid,)
    ).fetchall()
    return [dict(r) for r in rows]


GIFTS_DIR = os.path.join(os.path.dirname(BASE_DIR), "assets", "gifts-v2")
GIFT_RE = re.compile(r"^(.+)-(\d+)\.png$")


def load_catalogue():
    catalogue = {}
    try:
        for name in os.listdir(GIFTS_DIR):
            match = GIFT_RE.match(name)
            if not match:
                continue
            price = int(match.group(2))
            rate = PLUSH_RATE if name.startswith("plush-pepe") else max(1, round(price * 0.1))
            catalogue[name] = {"file": name, "price": price, "rate": rate}
    except FileNotFoundError:
        pass
    return catalogue


CATALOGUE = load_catalogue()


def spin(uid, gift_file, chance):
    """Возвращает (status, payload). Исход считается только на сервере."""
    gift = CATALOGUE.get(gift_file)
    if gift is None:
        return 400, {"error": "unknown_gift"}
    try:
        chance = int(chance)
    except (TypeError, ValueError):
        return 400, {"error": "bad_chance"}
    if chance < 1 or chance > 85:
        return 400, {"error": "bad_chance"}

    cost = gift["rate"] * chance
    won = int.from_bytes(os.urandom(4), "big") % 100 < chance
    ts = now()

    with tx() as db:
        row = db.execute("SELECT stars FROM users WHERE uid=?", (uid,)).fetchone()
        if row is None:
            return 401, {"error": "no_user"}
        if row["stars"] < cost:
            return 402, {"error": "no_money", "need": cost, "stars": row["stars"]}

        db.execute("UPDATE users SET stars=stars-? WHERE uid=?", (cost, uid))
        if won:
            db.execute(
                "INSERT INTO inventory(uid, gift, price, ts) VALUES(?,?,?,?)",
                (uid, gift["file"], gift["price"], ts),
            )
        db.execute(
            "INSERT INTO spins(uid, gift, chance, cost, won, ts) VALUES(?,?,?,?,?,?)",
            (uid, gift["file"], chance, cost, 1 if won else 0, ts),
        )
        after = db.execute("SELECT stars, coins FROM users WHERE uid=?", (uid,)).fetchone()

    payload = {
        "won": won,
        "gift": gift["file"],
        "price": gift["price"],
        "chance": chance,
        "cost": cost,
        "stars": after["stars"],
        "coins": after["coins"],
    }
    if won:
        payload["inventory"] = inventory_of(uid)
    return 200, payload


def apply_promo(uid, code):
    code = (code or "").strip().upper()
    if not code:
        return 400, {"error": "empty"}
    ts = now()

    with tx() as db:
        promo = db.execute("SELECT * FROM promos WHERE code=?", (code,)).fetchone()
        if promo is None:
            return 404, {"error": "not_found"}
        used = db.execute(
            "SELECT 1 FROM promo_uses WHERE code=? AND uid=?", (code, uid)
        ).fetchone()
        if used:
            return 409, {"error": "already_used"}
        if promo["used"] >= promo["max_uses"]:
            return 409, {"error": "exhausted"}

        db.execute("INSERT INTO promo_uses(code, uid, ts) VALUES(?,?,?)", (code, uid, ts))
        db.execute("UPDATE promos SET used=used+1 WHERE code=?", (code,))
        if promo["kind"] == "stars":
            db.execute("UPDATE users SET stars=stars+? WHERE uid=?", (promo["amount"], uid))
        else:
            db.execute("UPDATE users SET coins=coins+? WHERE uid=?", (promo["amount"], uid))

        row = db.execute("SELECT stars, coins FROM users WHERE uid=?", (uid,)).fetchone()

    return 200, {
        "ok": True,
        "code": code,
        "kind": promo["kind"],
        "amount": promo["amount"],
        "stars": row["stars"],
        "coins": row["coins"],
    }


def withdraw(uid, item_id):
    try:
        item_id = int(item_id)
    except (TypeError, ValueError):
        return 400, {"error": "bad_id"}
    with tx() as db:
        row = db.execute(
            "SELECT id, gift, price FROM inventory WHERE id=? AND uid=?", (item_id, uid)
        ).fetchone()
        if row is None:
            return 404, {"error": "not_found"}
        db.execute("DELETE FROM inventory WHERE id=?", (item_id,))
    return 200, {"ok": True, "gift": row["gift"], "inventory": inventory_of(uid)}


def exchange(uid, coins):
    try:
        coins = int(coins)
    except (TypeError, ValueError):
        return 400, {"error": "bad_amount"}
    if coins < EXCHANGE_RATE:
        return 400, {"error": "too_small"}
    stars = coins // EXCHANGE_RATE
    spent = stars * EXCHANGE_RATE
    with tx() as db:
        row = db.execute("SELECT coins FROM users WHERE uid=?", (uid,)).fetchone()
        if row is None:
            return 401, {"error": "no_user"}
        if row["coins"] < spent:
            return 402, {"error": "no_money"}
        db.execute("UPDATE users SET coins=coins-?, stars=stars+? WHERE uid=?", (spent, stars, uid))
        after = db.execute("SELECT stars, coins FROM users WHERE uid=?", (uid,)).fetchone()
    return 200, {"ok": True, "stars": after["stars"], "coins": after["coins"], "spent": spent}


def wheel_spin(uid):
    """Крутит колесо на сервере: 3 бесплатных спина в день, дальше 10 ⭐."""
    day = today()
    with tx() as db:
        row = db.execute(
            "SELECT stars, coins, wheel_date, wheel_used FROM users WHERE uid=?", (uid,)
        ).fetchone()
        if row is None:
            return 401, {"error": "no_user"}

        used = row["wheel_used"] if row["wheel_date"] == day else 0
        paid = used >= FREE_SPINS
        if paid and row["stars"] < PAID_SPIN_COST:
            return 402, {"error": "no_money", "need": PAID_SPIN_COST, "stars": row["stars"]}

        index = int.from_bytes(os.urandom(4), "big") % len(WHEEL_PRIZES)
        prize = WHEEL_PRIZES[index]

        stars = row["stars"] - (PAID_SPIN_COST if paid else 0)
        coins = row["coins"]
        if prize["type"] == "stars":
            stars += prize["value"]
        elif prize["type"] == "coins":
            coins += prize["value"]

        new_used = used if paid else used + 1
        db.execute(
            "UPDATE users SET stars=?, coins=?, wheel_date=?, wheel_used=? WHERE uid=?",
            (stars, coins, day, new_used, uid),
        )

    return 200, {
        "index": index,
        "prize": prize,
        "stars": stars,
        "coins": coins,
        "spins_left": max(0, FREE_SPINS - new_used),
        "paid": paid
    }


def farm_sell(uid, amount):
    """Продажа продуктов с фермы: начисляет монеты на сервере."""
    try:
        amount = int(amount)
    except (TypeError, ValueError):
        return 400, {"error": "bad_amount"}
    if amount <= 0 or amount > MAX_FARM_AMOUNT:
        return 400, {"error": "bad_amount"}

    with tx() as db:
        row = db.execute("SELECT coins FROM users WHERE uid=?", (uid,)).fetchone()
        if row is None:
            return 401, {"error": "no_user"}
        db.execute("UPDATE users SET coins=coins+? WHERE uid=?", (amount, uid))
        after = db.execute("SELECT stars, coins FROM users WHERE uid=?", (uid,)).fetchone()

    return 200, {"ok": True, "coins": after["coins"], "stars": after["stars"]}


def farm_buy(uid, amount):
    """Покупки в ферме (животные, загоны, грядки): списывает монеты на сервере."""
    try:
        amount = int(amount)
    except (TypeError, ValueError):
        return 400, {"error": "bad_amount"}
    if amount <= 0 or amount > MAX_FARM_AMOUNT:
        return 400, {"error": "bad_amount"}

    with tx() as db:
        row = db.execute("SELECT coins FROM users WHERE uid=?", (uid,)).fetchone()
        if row is None:
            return 401, {"error": "no_user"}
        if row["coins"] < amount:
            return 402, {"error": "no_money", "coins": row["coins"]}
        db.execute("UPDATE users SET coins=coins-? WHERE uid=?", (amount, uid))
        after = db.execute("SELECT stars, coins FROM users WHERE uid=?", (uid,)).fetchone()

    return 200, {"ok": True, "coins": after["coins"], "stars": after["stars"]}


def dev_grant(uid, stars=0, coins=0):
    with tx() as db:
        db.execute(
            "UPDATE users SET stars=stars+?, coins=coins+? WHERE uid=?", (stars, coins, uid)
        )
        row = db.execute("SELECT stars, coins FROM users WHERE uid=?", (uid,)).fetchone()
    return 200, {"ok": True, "stars": row["stars"], "coins": row["coins"]}
