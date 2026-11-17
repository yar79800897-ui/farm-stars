"""Проверки движка русских шашек. Запуск: py server/test_checkers.py"""

import checkers

failures = []


def check(name, condition, extra=""):
    if condition:
        print("ok   " + name)
    else:
        failures.append(name)
        print("FAIL " + name + (" — " + extra if extra else ""))


def board_from(pieces):
    cells = ["."] * 64
    for row, col, piece in pieces:
        cells[row * 8 + col] = piece
    return "".join(cells)


def index(row, col):
    return row * 8 + col


# 1. Стартовая позиция: у белых 7 ходов, у чёрных 7
start = checkers.initial_board()
white_moves = checkers.legal_moves(start, checkers.WHITE)
black_moves = checkers.legal_moves(start, checkers.BLACK)
check("старт: 7 ходов у белых", len(white_moves) == 7, str(len(white_moves)))
check("старт: 7 ходов у чёрных", len(black_moves) == 7, str(len(black_moves)))
check("старт: все ходы без взятия", all(not m["captured"] for m in white_moves))

# 2. Обязательный бой: есть простое взятие, но бить обязательно
capture_board = board_from([
    (4, 3, "w"),
    (3, 4, "b"),
    (7, 0, "w"),
])
moves = checkers.legal_moves(capture_board, checkers.WHITE)
check("обязательный бой: только взятия", all(m["captured"] for m in moves), str(moves))
check("обязательный бой: один вариант", len(moves) == 1, str(len(moves)))

# 3. Правило большинства: выбираем взятие двух, а не одного
max_board = board_from([
    (6, 1, "w"), (5, 2, "b"), (3, 4, "b"),
    (6, 7, "w"), (5, 6, "b"),
])
moves = checkers.legal_moves(max_board, checkers.WHITE)
longest = max(len(m["captured"]) for m in moves) if moves else 0
check("большинство: остались только длинные", longest == 2 and all(len(m["captured"]) == 2 for m in moves), str(moves))

# 4. Превращение в дамку
promo_board = board_from([(1, 0, "w")])
moves = checkers.legal_moves(promo_board, checkers.WHITE)
check("превращение: есть ход", len(moves) == 1)
if moves:
    after = checkers.apply_move(promo_board, moves[0])
    check("превращение: стала дамкой", after[index(0, 1)] == "W", after)

# 5. Дамка бьёт на расстоянии
king_board = board_from([(5, 0, "W"), (2, 3, "b")])
moves = checkers.legal_moves(king_board, checkers.WHITE)
check("дамка: найдено взятие", any(m["captured"] for m in moves), str(moves))
if moves:
    move = [m for m in moves if m["captured"]][0]
    after = checkers.apply_move(king_board, move)
    check("дамка: побитая фигура убрана", after[index(2, 3)] == ".", after)
    check("дамка: осталась дамкой", after[move["path"][-1]] == "W", after)

# 6. Простые ходы дамки по всей диагонали
free_king = board_from([(7, 0, "W")])
moves = checkers.legal_moves(free_king, checkers.WHITE)
check("дамка: 7 ходов по диагонали", len(moves) == 7, str(len(moves)))

# 7. Блокировка: у стороны нет ходов — проигрыш
blocked = board_from([
    (7, 0, "w"), (6, 1, "b"), (5, 2, "b"),
])
check("блокировка: победитель чёрные", checkers.winner(blocked, checkers.WHITE) == checkers.BLACK,
      str(checkers.legal_moves(blocked, checkers.WHITE)))

# 8. Съеденные фигуры исчезают
simple_capture = board_from([(4, 3, "w"), (3, 4, "b")])
moves = checkers.legal_moves(simple_capture, checkers.WHITE)
after = checkers.apply_move(simple_capture, moves[0])
check("взятие: побитая убрана", after[index(3, 4)] == ".", after)
check("взятие: шашка на новом месте", after[index(2, 5)] == "w", after)

# 9. Бот возвращает легальный ход
bot_move = checkers.best_bot_move(start, checkers.WHITE, depth=2)
check("бот: ход из списка легальных", bot_move in checkers.legal_moves(start, checkers.WHITE))

print()
if failures:
    print("Провалено:", len(failures))
    raise SystemExit(1)
print("Все проверки пройдены")
