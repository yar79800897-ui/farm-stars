"""Русские шашки 8x8: доска, генерация ходов, применение.

Доска — строка из 64 символов, индекс = row * 8 + col (row 0 — верх, чёрные,
row 7 — низ, белые). Играют только тёмные поля: (row + col) % 2 == 1.

Фигуры: 'w'/'W' — белая простая/дамка, 'b'/'B' — чёрная простая/дамка,
'.' — пусто. Белые ходят вверх (row уменьшается).
"""

WHITE = "white"
BLACK = "black"

DIRS = ((-1, -1), (-1, 1), (1, -1), (1, 1))


def initial_board():
    cells = ["."] * 64
    for row in range(8):
        for col in range(8):
            if (row + col) % 2 != 1:
                continue
            if row <= 2:
                cells[row * 8 + col] = "b"
            elif row >= 5:
                cells[row * 8 + col] = "w"
    return "".join(cells)


def side_of(piece):
    if piece in ("w", "W"):
        return WHITE
    if piece in ("b", "B"):
        return BLACK
    return None


def other(side):
    return BLACK if side == WHITE else WHITE


def is_king(piece):
    return piece in ("W", "B")


def inside(row, col):
    return 0 <= row < 8 and 0 <= col < 8


def promote(piece, index):
    if piece == "w" and index < 8:
        return "W"
    if piece == "b" and index >= 56:
        return "B"
    return piece


def _find_captures(board, side):
    results = []

    def walk(cells, pos, piece, origin, path, captured):
        moved = False
        row0, col0 = divmod(pos, 8)

        for dr, dc in DIRS:
            if is_king(piece):
                row, col = row0 + dr, col0 + dc
                while inside(row, col) and cells[row * 8 + col] == ".":
                    row += dr
                    col += dc
                if not inside(row, col):
                    continue
                enemy = row * 8 + col
                if side_of(cells[enemy]) != other(side):
                    continue
                r2, c2 = row + dr, col + dc
                while inside(r2, c2) and cells[r2 * 8 + c2] == ".":
                    landing = r2 * 8 + c2
                    nxt = list(cells)
                    nxt[enemy] = "."
                    nxt[pos] = "."
                    nxt[landing] = piece
                    walk("".join(nxt), landing, piece, origin, path + [landing], captured + [enemy])
                    moved = True
                    r2 += dr
                    c2 += dc
            else:
                er, ec = row0 + dr, col0 + dc
                lr, lc = row0 + 2 * dr, col0 + 2 * dc
                if not inside(lr, lc):
                    continue
                enemy = er * 8 + ec
                landing = lr * 8 + lc
                if cells[enemy] == "." or cells[landing] != ".":
                    continue
                if side_of(cells[enemy]) != other(side):
                    continue
                nxt = list(cells)
                nxt[enemy] = "."
                nxt[pos] = "."
                piece_after = promote(piece, landing)
                nxt[landing] = piece_after
                walk("".join(nxt), landing, piece_after, origin, path + [landing], captured + [enemy])
                moved = True

        if not moved and path:
            results.append({"from": origin, "path": path, "captured": captured})

    for index, piece in enumerate(board):
        if side_of(piece) == side:
            walk(board, index, piece, index, [], [])

    return results


def legal_moves(board, side):
    captures = _find_captures(board, side)
    if captures:
        most = max(len(move["captured"]) for move in captures)
        return [move for move in captures if len(move["captured"]) == most]

    moves = []
    for index, piece in enumerate(board):
        if side_of(piece) != side:
            continue
        row0, col0 = divmod(index, 8)

        if is_king(piece):
            for dr, dc in DIRS:
                row, col = row0 + dr, col0 + dc
                while inside(row, col) and board[row * 8 + col] == ".":
                    moves.append({"from": index, "path": [row * 8 + col], "captured": []})
                    row += dr
                    col += dc
        else:
            forward = -1 if piece == "w" else 1
            for dc in (-1, 1):
                row, col = row0 + forward, col0 + dc
                if inside(row, col) and board[row * 8 + col] == ".":
                    moves.append({"from": index, "path": [row * 8 + col], "captured": []})
    return moves


def apply_move(board, move):
    cells = list(board)
    start = move["from"]
    piece = cells[start]
    cells[start] = "."
    for index in move.get("captured", []):
        cells[index] = "."
    landing = move["path"][-1]
    cells[landing] = promote(piece, landing)
    return "".join(cells)


def find_move(moves, start, path):
    path = [int(x) for x in path]
    for move in moves:
        if move["from"] == start and move["path"] == path:
            return move
    return None


def count_pieces(board, side):
    return sum(1 for piece in board if side_of(piece) == side)


def winner(board, side_to_move):
    """Возвращает победителя или None (если партия продолжается)."""
    if count_pieces(board, side_to_move) == 0:
        return other(side_to_move)
    if not legal_moves(board, side_to_move):
        return other(side_to_move)
    return None


def evaluate(board, side):
    weights = {"w": 1.0, "W": 2.2, "b": 1.0, "B": 2.2}
    score = 0.0
    for piece in board:
        if piece == ".":
            continue
        value = weights[piece]
        score += value if side_of(piece) == side else -value
    return score


def best_bot_move(board, side, depth=3):
    moves = legal_moves(board, side)
    if not moves:
        return None

    def search(cells, turn, level):
        result = winner(cells, turn)
        if result is not None:
            return 1000 if result == side else -1000
        if level == 0:
            return evaluate(cells, side)

        best = None
        for move in legal_moves(cells, turn):
            value = search(apply_move(cells, move), other(turn), level - 1)
            if best is None:
                best = value
            elif turn == side and value > best:
                best = value
            elif turn != side and value < best:
                best = value
        return best

    best_move = None
    best_value = None
    for move in moves:
        value = search(apply_move(board, move), other(side), depth - 1)
        if best_value is None or value > best_value:
            best_value = value
            best_move = move
    return best_move
