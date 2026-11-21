import os
import re
import sqlite3
import threading
import time

import checkers
from turso import TursoClient

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("DB_PATH") or os.path.join(BASE_DIR, "data.db")
TURSO_URL = (os.environ.get("TURSO_URL") or "").strip()
TURSO_TOKEN = (os.environ.get("TURSO_TOKEN") or "").strip()

START_STARS = 0
START_COINS = 0
EXCHANGE_RATE = 2000
PLUSH_RATE = 10000
FREE_SPINS = 3
PAID_SPIN_COST = 10
MAX_FARM_AMOUNT = 50000

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

SEED_PROMOS = [
    ("FARMSTARS17967", "stars", 25000, 100000),
    ("STARS10000", "stars", 10000, 100),
    ("FARMSTARS", "stars", 25, 1000),
    ("HARVEST", "coins", 50000, 1000),
]

SCHEMA = [
    """CREATE TABLE IF NOT EXISTS users (
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
    )""",
    """CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT NOT NULL,
        gift TEXT NOT NULL,
        price INTEGER NOT NULL,
        ts INTEGER NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS inventory_uid ON inventory(uid)",
    """CREATE TABLE IF NOT EXISTS promos (
        code TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        amount INTEGER NOT NULL,
        max_uses INTEGER NOT NULL DEFAULT 1,
        used INTEGER NOT NULL DEFAULT 0
    )""",
    """CREATE TABLE IF NOT EXISTS promo_uses (
        code TEXT NOT NULL,
        uid TEXT NOT NULL,
        ts INTEGER NOT NULL,
        PRIMARY KEY (code, uid)
    )""",
    """CREATE TABLE IF NOT EXISTS spins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT NOT NULL,
        gift TEXT NOT NULL,
        chance INTEGER NOT NULL,
        cost INTEGER NOT NULL,
        won INTEGER NOT NULL,
        ts INTEGER NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS spins_uid ON spins(uid)",
    """CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT NOT NULL,
        stars INTEGER NOT NULL,
        payload TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending',
        charge_id TEXT,
        created INTEGER NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS invoices_uid ON invoices(uid)",
    """CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mode TEXT NOT NULL DEFAULT 'checkers',
        bet INTEGER NOT NULL,
        minutes INTEGER NOT NULL,
        white_uid TEXT NOT NULL,
        white_name TEXT,
        black_uid TEXT,
        black_name TEXT,
        board TEXT NOT NULL,
        turn TEXT NOT NULL,
        status TEXT NOT NULL,
        winner TEXT,
        white_ms INTEGER NOT NULL,
        black_ms INTEGER NOT NULL,
        last_ts INTEGER NOT NULL,
        w_seen INTEGER NOT NULL,
        b_seen INTEGER NOT NULL,
        bot INTEGER NOT NULL DEFAULT 0,
        created INTEGER NOT NULL,
        finished INTEGER
    )""",
    "CREATE INDEX IF NOT EXISTS games_waiting ON games(status, bet, minutes)",
]


class SQLiteBackend:
    name = "sqlite"

    def __init__(self, path):
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")

    def query(self, sql, params=()):
        with self._lock:
            cursor = self._conn.execute(sql, tuple(params or ()))
            if cursor.description is None:
                return []
            return [dict(row) for row in cursor.fetchall()]

    def query_batch(self, statements):
        with self._lock:
            results = []
            for sql, params in statements:
                cursor = self._conn.execute(sql, tuple(params or ()))
                results.append([dict(row) for row in cursor.fetchall()] if cursor.description else [])
            return results


class TursoBackend:
    name = "turso"

    def __init__(self, url, token):
        self._client = TursoClient(url, token)

    def query(self, sql, params=()):
        return self._client.execute(sql, tuple(params or ()))

    def query_batch(self, statements):
        return self._client.batch(statements)


_backend = None


def backend():
    global _backend
    if _backend is None:
        if TURSO_URL and TURSO_TOKEN:
            _backend = TursoBackend(TURSO_URL, TURSO_TOKEN)
        else:
            _backend = SQLiteBackend(DB_PATH)
        init_schema(_backend)
    return _backend


def backend_name():
    return backend().name


def init_schema(db):
    for statement in SCHEMA:
        db.query(statement)

    columns = [row["name"] for row in db.query("PRAGMA table_info(users)")]
    if "wheel_date" not in columns:
        db.query("ALTER TABLE users ADD COLUMN wheel_date TEXT")
    if "wheel_used" not in columns:
        db.query("ALTER TABLE users ADD COLUMN wheel_used INTEGER NOT NULL DEFAULT 0")

    for code, kind, amount, max_uses in SEED_PROMOS:
        db.query(
            "INSERT OR IGNORE INTO promos(code, kind, amount, max_uses) VALUES(?,?,?,?)",
            (code, kind, amount, max_uses),
        )


def now():
    return int(time.time())


def today():
    return time.strftime("%Y-%m-%d", time.localtime())


def spins_left_of(row):
    used = row.get("wheel_used") or 0
    if row.get("wheel_date") != today():
        used = 0
    return max(0, FREE_SPINS - used)


def ensure_user(uid, name=None, username=None):
    db = backend()
    ts = now()
    db.query(
        "INSERT OR IGNORE INTO users(uid, name, username, stars, coins, xp, wheel_date, wheel_used, created, seen) "
        "VALUES(?,?,?,?,?,?,?,?,?,?)",
        (uid, name, username or "", START_STARS, START_COINS, 0, today(), 0, ts, ts),
    )
    db.query(
        "UPDATE users SET seen=?, name=COALESCE(NULLIF(?, ''), name), "
        "username=COALESCE(NULLIF(?, ''), username) WHERE uid=?",
        (ts, name or "", username or "", uid),
    )
    rows = db.query("SELECT * FROM users WHERE uid=?", (uid,))
    return rows[0] if rows else None



def user_public(row):
    return {
        "id": row["uid"],
        "name": row.get("name") or "Фермер",
        "username": row.get("username"),
        "stars": row.get("stars") or 0,
        "coins": row.get("coins") or 0,
        "xp": row.get("xp") or 0,
        "spins_left": spins_left_of(row),
    }


def inventory_of(uid):
    rows = backend().query(
        "SELECT id, gift, price, ts FROM inventory WHERE uid=? ORDER BY id DESC", (uid,)
    )
    return [dict(row) for row in rows]


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

    db = backend()
    cost = gift["rate"] * chance

    rows = db.query("SELECT stars, coins FROM users WHERE uid=?", (uid,))
    if not rows:
        return 401, {"error": "no_user"}
    if (rows[0].get("stars") or 0) < cost:
        return 402, {"error": "no_money", "need": cost, "stars": rows[0].get("stars") or 0}

    won = int.from_bytes(os.urandom(4), "big") % 100 < chance
    ts = now()

    db.query("UPDATE users SET stars=stars-? WHERE uid=? AND stars>=?", (cost, uid, cost))


    statements = [
        ("INSERT INTO spins(uid, gift, chance, cost, won, ts) VALUES(?,?,?,?,?,?)",
         (uid, gift["file"], chance, cost, 1 if won else 0, ts)),
    ]
    if won:
        statements.insert(0, (
            "INSERT INTO inventory(uid, gift, price, ts) VALUES(?,?,?,?)",
            (uid, gift["file"], gift["price"], ts),
        ))
        statements.append((
            "SELECT id, gift, price, ts FROM inventory WHERE uid=? ORDER BY id DESC",
            (uid,),
        ))

    results = db.query_batch(statements)
    after = db.query("SELECT stars, coins FROM users WHERE uid=?", (uid,))
    balance = after[0] if after else {}

    payload = {
        "won": won,
        "gift": gift["file"],
        "price": gift["price"],
        "chance": chance,
        "cost": cost,
        "stars": balance.get("stars") or 0,
        "coins": balance.get("coins") or 0,
    }
    if won:
        payload["inventory"] = [dict(row) for row in results[-1]]
    return 200, payload


def apply_promo(uid, code):
    code = (code or "").strip().upper()
    if not code:
        return 400, {"error": "empty"}

    db = backend()
    rows = db.query("SELECT * FROM promos WHERE code=?", (code,))
    if not rows:
        return 404, {"error": "not_found"}
    promo = rows[0]

    used = db.query("SELECT 1 AS ok FROM promo_uses WHERE code=? AND uid=?", (code, uid))
    if used:
        return 409, {"error": "already_used"}
    if (promo.get("used") or 0) >= (promo.get("max_uses") or 0):
        return 409, {"error": "exhausted"}

    ts = now()
    db.query("INSERT INTO promo_uses(code, uid, ts) VALUES(?,?,?)", (code, uid, ts))
    db.query("UPDATE promos SET used=used+1 WHERE code=?", (code,))

    if promo["kind"] == "stars":
        db.query("UPDATE users SET stars=stars+? WHERE uid=?", (promo["amount"], uid))
    else:
        db.query("UPDATE users SET coins=coins+? WHERE uid=?", (promo["amount"], uid))

    row = db.query("SELECT stars, coins FROM users WHERE uid=?", (uid,))[0]
    return 200, {
        "ok": True,
        "code": code,
        "kind": promo["kind"],
        "amount": promo["amount"],
        "stars": row.get("stars") or 0,
        "coins": row.get("coins") or 0,
    }


def withdraw(uid, item_id):
    try:
        item_id = int(item_id)
    except (TypeError, ValueError):
        return 400, {"error": "bad_id"}

    db = backend()
    rows = db.query("SELECT id, gift, price FROM inventory WHERE id=? AND uid=?", (item_id, uid))
    if not rows:
        return 404, {"error": "not_found"}

    db.query("DELETE FROM inventory WHERE id=? AND uid=?", (item_id, uid))
    return 200, {"ok": True, "gift": rows[0]["gift"], "inventory": inventory_of(uid)}


def exchange(uid, coins):
    try:
        coins = int(coins)
    except (TypeError, ValueError):
        return 400, {"error": "bad_amount"}
    if coins < EXCHANGE_RATE:
        return 400, {"error": "too_small"}

    stars = coins // EXCHANGE_RATE
    spent = stars * EXCHANGE_RATE

    db = backend()
    check = db.query("SELECT coins FROM users WHERE uid=?", (uid,))
    if not check:
        return 401, {"error": "no_user"}
    if (check[0].get("coins") or 0) < spent:
        return 402, {"error": "no_money"}

    db.query("UPDATE users SET coins=coins-?, stars=stars+? WHERE uid=?", (spent, stars, uid))
    after = db.query("SELECT stars, coins FROM users WHERE uid=?", (uid,))
    balance = after[0] if after else {}

    return 200, {
        "ok": True,
        "stars": balance.get("stars") or 0,
        "coins": balance.get("coins") or 0,
        "spent": spent,
    }


def wheel_spin(uid):
    """3 бесплатных прокрута в день, дальше 10 ⭐."""
    day = today()
    db = backend()
    rows = db.query("SELECT stars, coins, wheel_date, wheel_used FROM users WHERE uid=?", (uid,))
    if not rows:
        return 401, {"error": "no_user"}
    row = rows[0]

    used = row.get("wheel_used") or 0
    if row.get("wheel_date") != day:
        used = 0
    paid = used >= FREE_SPINS
    stars = row.get("stars") or 0
    coins = row.get("coins") or 0

    if paid and stars < PAID_SPIN_COST:
        return 402, {"error": "no_money", "need": PAID_SPIN_COST, "stars": stars}

    index = int.from_bytes(os.urandom(4), "big") % len(WHEEL_PRIZES)
    prize = WHEEL_PRIZES[index]

    if paid:
        stars -= PAID_SPIN_COST
    if prize["type"] == "stars":
        stars += prize["value"]
    elif prize["type"] == "coins":
        coins += prize["value"]

    new_used = used if paid else used + 1
    db.query(
        "UPDATE users SET stars=?, coins=?, wheel_date=?, wheel_used=? WHERE uid=?",
        (stars, coins, day, new_used, uid),
    )

    return 200, {
        "index": index,
        "prize": prize,
        "stars": stars,
        "coins": coins,
        "spins_left": max(0, FREE_SPINS - new_used),
        "paid": paid,
    }


def farm_sell(uid, amount):
    try:
        amount = int(amount)
    except (TypeError, ValueError):
        return 400, {"error": "bad_amount"}
    if amount <= 0 or amount > MAX_FARM_AMOUNT:
        return 400, {"error": "bad_amount"}

    db = backend()
    db.query("UPDATE users SET coins=coins+? WHERE uid=?", (amount, uid))
    rows = db.query("SELECT stars, coins FROM users WHERE uid=?", (uid,))
    if not rows:
        return 401, {"error": "no_user"}
    return 200, {"ok": True, "coins": rows[0].get("coins") or 0, "stars": rows[0].get("stars") or 0}


def farm_buy(uid, amount):
    try:
        amount = int(amount)
    except (TypeError, ValueError):
        return 400, {"error": "bad_amount"}
    if amount <= 0 or amount > MAX_FARM_AMOUNT:
        return 400, {"error": "bad_amount"}

    db = backend()
    check = db.query("SELECT coins FROM users WHERE uid=?", (uid,))
    if not check:
        return 401, {"error": "no_user"}
    if (check[0].get("coins") or 0) < amount:
        return 402, {"error": "no_money", "coins": check[0].get("coins") or 0}

    db.query("UPDATE users SET coins=coins-? WHERE uid=?", (amount, uid))
    rows = db.query("SELECT stars, coins FROM users WHERE uid=?", (uid,))
    balance = rows[0] if rows else {}

    return 200, {"ok": True, "coins": balance.get("coins") or 0, "stars": balance.get("stars") or 0}


def create_invoice(uid, stars, payload):
    backend().query(
        "INSERT INTO invoices(uid, stars, payload, status, created) VALUES(?,?,?,?,?)",
        (uid, stars, payload, "pending", now()),
    )
    return True


def invoice_by_payload(payload):
    rows = backend().query("SELECT * FROM invoices WHERE payload=?", (payload,))
    return rows[0] if rows else None


def mark_invoice_paid(payload, charge_id):
    db = backend()
    rows = db.query("SELECT * FROM invoices WHERE payload=?", (payload,))
    if not rows:
        return None
    invoice = rows[0]
    if invoice.get("status") == "paid":
        return None

    db.query("UPDATE invoices SET status='paid', charge_id=? WHERE payload=?", (charge_id, payload))
    db.query("UPDATE users SET stars=stars+? WHERE uid=?", (invoice["stars"], invoice["uid"]))
    after = db.query("SELECT stars, coins FROM users WHERE uid=?", (invoice["uid"],))[0]
    return {
        "uid": invoice["uid"],
        "amount": invoice["stars"],
        "stars": after.get("stars") or 0,
        "coins": after.get("coins") or 0,
    }


def dev_grant(uid, stars=0, coins=0):
    db = backend()
    db.query("UPDATE users SET stars=stars+?, coins=coins+? WHERE uid=?", (stars, coins, uid))
    rows = db.query("SELECT stars, coins FROM users WHERE uid=?", (uid,))
    if not rows:
        return 401, {"error": "no_user"}
    return 200, {"ok": True, "stars": rows[0].get("stars") or 0, "coins": rows[0].get("coins") or 0}

# ==========================================================================
# ШАШКИ: игры один на один со ставками
# ==========================================================================

CHECKERS_MIN_BET = 10
CHECKERS_MINUTES = (5, 10)
CHECKERS_COMMISSION = 0.10
CHECKERS_BOT_UID = "bot"
CHECKERS_BOT_NAME = "Сильный бот"
CHECKERS_AWAY = 30
CHECKERS_BOT_DEPTH = 3
CHECKERS_BOT_DELAY = 3  # last_ts в целых секундах: реальная пауза бота 2–3 с


def _game(game_id):
    rows = backend().query("SELECT * FROM games WHERE id=?", (game_id,))
    return rows[0] if rows else None


def _finish_game(game, winner):
    db = backend()
    bet = game["bet"] or 0
    if winner == "draw":
        if game["black_uid"] and game["black_uid"] != CHECKERS_BOT_UID:
            db.query("UPDATE users SET stars=stars+? WHERE uid IN (?, ?)", (bet, game["white_uid"], game["black_uid"]))
        else:
            db.query("UPDATE users SET stars=stars+? WHERE uid=?", (bet, game["white_uid"]))
    elif winner:
        winner_uid = game["white_uid"] if winner == "white" else game["black_uid"]
        prize = int(bet * 2 * (1 - CHECKERS_COMMISSION))
        if winner_uid and winner_uid != CHECKERS_BOT_UID:
            db.query("UPDATE users SET stars=stars+? WHERE uid=?", (prize, winner_uid))
    db.query("UPDATE games SET status='finished', winner=?, finished=? WHERE id=?",
             (winner or "", now(), game["id"]))


def _clock_left(game):
    elapsed_ms = max(0, now() - (game["last_ts"] or 0)) * 1000
    white_ms = game["white_ms"]
    black_ms = game["black_ms"]
    if game["status"] == "active":
        if game["turn"] == "white":
            white_ms -= elapsed_ms
        else:
            black_ms -= elapsed_ms
    return max(0, white_ms), max(0, black_ms)


def _bot_move(game):
    """Бот отвечает не сразу, а после паузы — её отсчитывает опрос состояния.
    Клиент опрашивает раз в секунду без наложения запросов, поэтому двойной
    хода бота не бывает; при нескольких браузерах нужна блокировка."""
    if now() - (game["last_ts"] or 0) < CHECKERS_BOT_DELAY:
        return game

    # время бота тикает, пока он «думает»: без этого его часы не убывали
    elapsed_ms = max(0, now() - (game["last_ts"] or 0)) * 1000
    black_ms = max(0, game["black_ms"] - elapsed_ms)
    if black_ms <= 0:
        _finish_game(game, "white")
        return _game(game["id"])

    move = checkers.best_bot_move(game["board"], "black", CHECKERS_BOT_DEPTH)
    if move is None:
        _finish_game(game, "white")
        return _game(game["id"])

    board = checkers.apply_move(game["board"], move)
    backend().query("UPDATE games SET board=?, turn='white', black_ms=?, last_ts=? WHERE id=?",
                    (board, black_ms, now(), game["id"]))
    finished = checkers.winner(board, "white")
    if finished:
        _finish_game(_game(game["id"]), finished)
    return _game(game["id"])


def checkers_cancel(uid, game_id):
    game = _game(game_id)
    if not game:
        return 404, {"error": "not_found"}
    if game["white_uid"] != uid:
        return 403, {"error": "not_player"}
    if game["status"] != "waiting":
        return 409, {"error": "not_waiting"}
    _finish_game(game, "")
    backend().query("UPDATE users SET stars=stars+? WHERE uid=?", (game["bet"], uid))
    return 200, {"ok": True}


def checkers_payload(game, uid):
    side = "white" if game["white_uid"] == uid else "black"
    white_ms, black_ms = _clock_left(game)
    moves = []
    if game["status"] == "active" and game["turn"] == side:
        moves = [{"from": m["from"], "to": m["path"][-1], "captures": len(m["captured"])}
                 for m in checkers.legal_moves(game["board"], side)]
    return {
        "id": game["id"],
        "bet": game["bet"],
        "minutes": game["minutes"],
        "board": game["board"],
        "turn": game["turn"],
        "status": game["status"],
        "winner": game["winner"] or None,
        "myColor": side,
        "bot": bool(game["bot"]),
        "whiteName": game["white_name"],
        "blackName": game["black_name"],
        "whiteMs": max(0, white_ms),
        "blackMs": max(0, black_ms),
        "moves": moves,
        "ageSec": max(0, now() - (game["created"] or 0)),
    }


def start_checkers(uid, name, bet, minutes):
    try:
        bet = int(bet)
        minutes = int(minutes)
    except (TypeError, ValueError):
        return 400, {"error": "bad_params"}
    if bet < CHECKERS_MIN_BET or minutes not in CHECKERS_MINUTES:
        return 400, {"error": "bad_params"}

    db = backend()
    rows = db.query("SELECT stars FROM users WHERE uid=?", (uid,))
    if not rows:
        return 401, {"error": "no_user"}
    if (rows[0].get("stars") or 0) < bet:
        return 402, {"error": "no_money"}

    waiting = db.query(
        "SELECT * FROM games WHERE mode='checkers' AND status='waiting' AND bet=? AND minutes=? "
        "AND white_uid<>? ORDER BY id LIMIT 1",
        (bet, minutes, uid),
    )
    ts = now()
    total = minutes * 60000

    db.query("UPDATE users SET stars=stars-? WHERE uid=? AND stars>=?", (bet, uid, bet))

    if waiting:
        game = waiting[0]
        db.query(
            "UPDATE games SET status='active', black_uid=?, black_name=?, white_ms=?, black_ms=?, "
            "last_ts=?, w_seen=?, b_seen=? WHERE id=?",
            (uid, name, total, total, ts, ts, ts, game["id"]),
        )
        return 200, checkers_payload(_game(game["id"]), uid)

    db.query(
        "INSERT INTO games(mode, bet, minutes, white_uid, white_name, board, turn, status, "
        "white_ms, black_ms, last_ts, w_seen, b_seen, created) "
        "VALUES('checkers',?,?,?,?,?,?, 'waiting',?,?,?,?,?,?)",
        (bet, minutes, uid, name, checkers.initial_board(), checkers.WHITE,
         total, total, ts, ts, ts, ts),
    )
    gid = db.query("SELECT last_insert_rowid() AS id")[0]["id"]
    return 200, checkers_payload(_game(gid), uid)


def attach_checkers_bot(uid, game_id):
    game = _game(game_id)
    if not game:
        return 404, {"error": "not_found"}
    if game["status"] != "waiting" or game["white_uid"] != uid:
        return 409, {"error": "not_waiting"}

    ts = now()
    backend().query(
        "UPDATE games SET status='active', black_uid=?, black_name=?, bot=1, last_ts=?, w_seen=?, b_seen=? WHERE id=?",
        (CHECKERS_BOT_UID, CHECKERS_BOT_NAME, ts, ts, ts, game_id),
    )
    return 200, checkers_payload(_game(game_id), uid)


def checkers_game_state(uid, game_id):
    game = _game(game_id)
    if not game:
        return 404, {"error": "not_found"}
    if uid not in (game["white_uid"], game["black_uid"]):
        return 403, {"error": "not_player"}

    if game["status"] == "active":
        ts = now()
        side = "white" if game["white_uid"] == uid else "black"
        if side == "white":
            backend().query("UPDATE games SET w_seen=? WHERE id=?", (ts, game_id))
        else:
            backend().query("UPDATE games SET b_seen=? WHERE id=?", (ts, game_id))
        game = _game(game_id)

        if not game["bot"]:
            opponent_seen = game["b_seen"] if side == "white" else game["w_seen"]
            if ts - (opponent_seen or 0) > CHECKERS_AWAY:
                _finish_game(game, side)
                game = _game(game_id)

        if game["status"] == "active":
            white_ms, black_ms = _clock_left(game)
            if white_ms <= 0:
                _finish_game(game, "black")
                game = _game(game_id)
            elif black_ms <= 0:
                _finish_game(game, "white")
                game = _game(game_id)

        if game["status"] == "active" and game["bot"] and game["turn"] == "black":
            game = _bot_move(game)

    return 200, checkers_payload(game, uid)


def checkers_move(uid, game_id, start, target):
    game = _game(game_id)
    if not game:
        return 404, {"error": "not_found"}
    if game["status"] != "active":
        return 409, {"error": "not_active"}

    side = "white" if game["white_uid"] == uid else ("black" if game["black_uid"] == uid else None)
    if side is None:
        return 403, {"error": "not_player"}
    if game["turn"] != side:
        return 409, {"error": "not_your_turn"}

    try:
        start = int(start)
        target = int(target)
    except (TypeError, ValueError):
        return 400, {"error": "bad_move"}

    options = [m for m in checkers.legal_moves(game["board"], side)
               if m["from"] == start and m["path"][-1] == target]
    if not options:
        return 400, {"error": "illegal_move"}
    move = options[0]

    elapsed_ms = max(0, now() - (game["last_ts"] or 0)) * 1000
    white_ms, black_ms = game["white_ms"], game["black_ms"]
    if side == "white":
        white_ms -= elapsed_ms
    else:
        black_ms -= elapsed_ms

    if white_ms <= 0 or black_ms <= 0:
        _finish_game(game, "black" if white_ms <= 0 else "white")
        return 200, checkers_payload(_game(game_id), uid)

    board = checkers.apply_move(game["board"], move)
    turn = checkers.other(side)
    ts = now()
    db = backend()
    db.query(
        "UPDATE games SET board=?, turn=?, white_ms=?, black_ms=?, last_ts=? WHERE id=?",
        (board, turn, white_ms, black_ms, ts, game_id),
    )

    # ход бота делает _bot_move при следующем опросе состояния
    finished = checkers.winner(board, turn)
    if finished:
        _finish_game(_game(game_id), finished)

    return 200, checkers_payload(_game(game_id), uid)


def checkers_resign(uid, game_id):
    game = _game(game_id)
    if not game:
        return 404, {"error": "not_found"}
    if game["status"] != "active":
        return 409, {"error": "not_active"}
    if uid == game["white_uid"]:
        _finish_game(game, "black")
    elif uid == game["black_uid"]:
        _finish_game(game, "white")
    else:
        return 403, {"error": "not_player"}
    return 200, checkers_payload(_game(game_id), uid)


def checkers_draw(uid, game_id):
    game = _game(game_id)
    if not game:
        return 404, {"error": "not_found"}
    if game["status"] != "active":
        return 409, {"error": "not_active"}
    if game["bot"]:
        return 409, {"error": "bot_declines"}
    if uid not in (game["white_uid"], game["black_uid"]):
        return 403, {"error": "not_player"}
    _finish_game(game, "draw")
    return 200, checkers_payload(_game(game_id), uid)
