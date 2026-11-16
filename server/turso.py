"""Минимальный клиент Turso (libSQL) по HTTP — без внешних зависимостей."""

import json
import urllib.error
import urllib.request


def _encode(value):
    if value is None:
        return {"type": "null"}
    if isinstance(value, bool):
        return {"type": "integer", "value": "1" if value else "0"}
    if isinstance(value, int):
        return {"type": "integer", "value": str(value)}
    if isinstance(value, float):
        return {"type": "real", "value": value}
    return {"type": "text", "value": str(value)}


def _decode(value):
    if value is None:
        return None
    if isinstance(value, dict):
        kind = value.get("type")
        if kind == "null":
            return None
        if kind == "integer":
            return int(value.get("value") or 0)
        if kind == "real":
            return float(value.get("value") or 0)
        return value.get("value")
    return value


class TursoError(RuntimeError):
    pass


class TursoClient:
    def __init__(self, url, token, timeout=25):
        self.url = (url or "").strip().rstrip("/")
        if self.url.startswith("libsql://"):
            self.url = "https://" + self.url[len("libsql://"):]
        self.token = (token or "").strip()
        self.timeout = timeout

    def _post(self, payload):
        request = urllib.request.Request(
            self.url + "/v2/pipeline",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": "Bearer " + self.token,
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = ""
            try:
                detail = exc.read().decode("utf-8")[:300]
            except Exception:
                pass
            raise TursoError("turso http {}: {}".format(exc.code, detail))
        except Exception as exc:
            raise TursoError("turso network: {}".format(exc))

    def _parse(self, item):
        if item.get("type") != "ok":
            error = item.get("error") or {}
            raise TursoError("turso: {} {}".format(error.get("code"), error.get("message")))
        response = item.get("response") or {}
        result = response.get("result") or {}
        columns = [column.get("name") for column in (result.get("cols") or [])]
        rows = []
        for raw in (result.get("rows") or []):
            rows.append({
                columns[i] if i < len(columns) else str(i): _decode(value)
                for i, value in enumerate(raw)
            })
        return rows

    def _send(self, statements):
        requests = [
            {"type": "execute", "stmt": {"sql": sql, "args": [_encode(p) for p in (params or ())]}}
            for sql, params in statements
        ]
        requests.append({"type": "close"})
        data = self._post({"requests": requests})
        results = data.get("results") or []
        if len(results) < len(statements):
            raise TursoError("turso: неполный ответ")
        return [self._parse(item) for item in results[:len(statements)]]

    def execute(self, sql, params=()):
        return self._send([(sql, params)])[0]

    def batch(self, statements):
        """Несколько запросов за один HTTP-вызов."""
        return self._send(list(statements))
