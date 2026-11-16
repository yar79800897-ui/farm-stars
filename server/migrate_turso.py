"""Перенос данных из одной базы Turso в другую.

Запуск (PowerShell):
    $env:OLD_TURSO_URL="libsql://..."; $env:OLD_TURSO_TOKEN="..."
    $env:NEW_TURSO_URL="libsql://..."; $env:NEW_TURSO_TOKEN="..."
    py server/migrate_turso.py
"""

import os
import sys

import store
from turso import TursoClient

TABLES = [
    ("users", "uid, name, username, stars, coins, xp, wheel_date, wheel_used, created, seen"),
    ("inventory", "id, uid, gift, price, ts"),
    ("promos", "code, kind, amount, max_uses, used"),
    ("promo_uses", "code, uid, ts"),
    ("invoices", "id, uid, stars, payload, status, charge_id, created"),
    ("spins", "id, uid, gift, chance, cost, won, ts"),
]


def required(name):
    value = (os.environ.get(name) or "").strip()
    if not value:
        print("Не задана переменная окружения: " + name)
        sys.exit(1)
    return value


def init_target(client):
    for statement in store.SCHEMA:
        client.execute(statement)
    columns = [row["name"] for row in client.execute("PRAGMA table_info(users)")]
    if "wheel_date" not in columns:
        client.execute("ALTER TABLE users ADD COLUMN wheel_date TEXT")
    if "wheel_used" not in columns:
        client.execute("ALTER TABLE users ADD COLUMN wheel_used INTEGER NOT NULL DEFAULT 0")


def copy_table(source, target, name, columns):
    rows = source.execute("SELECT {} FROM {}".format(columns, name))
    if not rows:
        print("  {}: пусто".format(name))
        return 0

    placeholders = ", ".join(["?"] * len(rows[0]))
    sql = "INSERT OR REPLACE INTO {}({}) VALUES({})".format(name, columns, placeholders)
    statements = [
        (sql, tuple(row[column] for column in row.keys()))
        for row in rows
    ]

    for start in range(0, len(statements), 40):
        target.batch(statements[start:start + 40])

    print("  {}: {} строк".format(name, len(rows)))
    return len(rows)


def main():
    old = TursoClient(required("OLD_TURSO_URL"), required("OLD_TURSO_TOKEN"))
    new = TursoClient(required("NEW_TURSO_URL"), required("NEW_TURSO_TOKEN"))

    print("Готовлю схему в новой базе...")
    init_target(new)

    total = 0
    print("Переношу данные:")
    for name, columns in TABLES:
        total += copy_table(old, new, name, columns)

    print("Готово. Записей перенесено:", total)


if __name__ == "__main__":
    main()
