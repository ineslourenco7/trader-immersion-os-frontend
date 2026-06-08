from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

import yaml
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "trader_immersion.db"
# AlphaForge is the strategy/worker engine module inside Trading Room.
# The legacy alpha-forge folder is treated as an engine state source, not a separate product.
ALPHAFORGE = Path("/home/ines/workspace/alpha-forge")

app = FastAPI(title="Trading Room API", version="0.2.0")
app.mount("/assets", StaticFiles(directory=ROOT / "assets"), name="assets")
app.mount("/data", StaticFiles(directory=DATA_DIR), name="data")
app.mount("/icons", StaticFiles(directory=ROOT / "icons"), name="icons") if (ROOT / "icons").exists() else None
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def db() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA foreign_keys=ON")
    return con


def init_db() -> None:
    with db() as con:
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS sessions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              started_at TEXT NOT NULL,
              ended_at TEXT,
              action TEXT NOT NULL DEFAULT 'start',
              allowed INTEGER NOT NULL DEFAULT 0,
              mental TEXT NOT NULL DEFAULT 'normal',
              losses INTEGER NOT NULL DEFAULT 0,
              risk REAL NOT NULL DEFAULT 0,
              regime TEXT NOT NULL DEFAULT 'unknown',
              note TEXT NOT NULL DEFAULT '',
              payload TEXT NOT NULL DEFAULT '{}'
            );
            CREATE TABLE IF NOT EXISTS journal (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              created_at TEXT NOT NULL,
              text TEXT NOT NULL,
              tags TEXT NOT NULL DEFAULT '[]',
              insight TEXT NOT NULL DEFAULT '',
              payload TEXT NOT NULL DEFAULT '{}'
            );
            CREATE TABLE IF NOT EXISTS twin_events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              created_at TEXT NOT NULL,
              event_type TEXT NOT NULL,
              signal TEXT NOT NULL,
              weight REAL NOT NULL DEFAULT 0,
              source TEXT NOT NULL DEFAULT '',
              payload TEXT NOT NULL DEFAULT '{}'
            );
            CREATE TABLE IF NOT EXISTS strategy_blueprints (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              created_at TEXT NOT NULL,
              name TEXT NOT NULL,
              market TEXT NOT NULL DEFAULT '',
              description TEXT NOT NULL,
              entry_rules TEXT NOT NULL DEFAULT '',
              exit_rules TEXT NOT NULL DEFAULT '',
              invalidation TEXT NOT NULL DEFAULT '',
              risk_rules TEXT NOT NULL DEFAULT '',
              uses_indicators INTEGER NOT NULL DEFAULT 0,
              status TEXT NOT NULL DEFAULT 'draft',
              payload TEXT NOT NULL DEFAULT '{}'
            );
            CREATE TABLE IF NOT EXISTS mt5_connections (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              created_at TEXT NOT NULL,
              label TEXT NOT NULL,
              mode TEXT NOT NULL DEFAULT 'manual',
              token TEXT NOT NULL UNIQUE,
              status TEXT NOT NULL DEFAULT 'setup',
              broker TEXT NOT NULL DEFAULT '',
              account_login TEXT NOT NULL DEFAULT '',
              server_name TEXT NOT NULL DEFAULT '',
              last_seen_at TEXT,
              payload TEXT NOT NULL DEFAULT '{}'
            );
            CREATE TABLE IF NOT EXISTS mt5_manual_trades (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              created_at TEXT NOT NULL,
              connection_id INTEGER,
              source TEXT NOT NULL DEFAULT 'manual',
              symbol TEXT NOT NULL,
              side TEXT NOT NULL DEFAULT '',
              opened_at TEXT NOT NULL DEFAULT '',
              closed_at TEXT NOT NULL DEFAULT '',
              lot REAL NOT NULL DEFAULT 0,
              entry REAL NOT NULL DEFAULT 0,
              exit REAL NOT NULL DEFAULT 0,
              pnl REAL NOT NULL DEFAULT 0,
              strategy TEXT NOT NULL DEFAULT '',
              note TEXT NOT NULL DEFAULT '',
              payload TEXT NOT NULL DEFAULT '{}'
            );
            CREATE TABLE IF NOT EXISTS trading_gps_entries (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              created_at TEXT NOT NULL,
              session_id INTEGER,
              symbol TEXT NOT NULL DEFAULT 'XAUUSD',
              direction TEXT NOT NULL DEFAULT '',
              reason TEXT NOT NULL DEFAULT '',
              verdict TEXT NOT NULL DEFAULT 'wait',
              score INTEGER NOT NULL DEFAULT 0,
              drivers TEXT NOT NULL DEFAULT '[]',
              blocked INTEGER NOT NULL DEFAULT 0,
              payload TEXT NOT NULL DEFAULT '{}'
            );
            CREATE TABLE IF NOT EXISTS trading_copilot_checks (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              created_at TEXT NOT NULL,
              session_id INTEGER,
              symbol TEXT NOT NULL DEFAULT 'XAUUSD',
              direction TEXT NOT NULL DEFAULT '',
              lot REAL NOT NULL DEFAULT 0,
              risk_reward REAL NOT NULL DEFAULT 0,
              rules_pass INTEGER NOT NULL DEFAULT 0,
              news_hits TEXT NOT NULL DEFAULT '[]',
              decision TEXT NOT NULL DEFAULT 'blocked',
              payload TEXT NOT NULL DEFAULT '{}'
            );
            CREATE TABLE IF NOT EXISTS marketplace_strategies (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              created_at TEXT NOT NULL,
              name TEXT NOT NULL,
              regime TEXT NOT NULL DEFAULT 'any',
              status TEXT NOT NULL DEFAULT 'paper',
              score REAL NOT NULL DEFAULT 0,
              trust REAL NOT NULL DEFAULT 0,
              win_rate REAL NOT NULL DEFAULT 0,
              max_drawdown REAL NOT NULL DEFAULT 0,
              description TEXT NOT NULL DEFAULT '',
              payload TEXT NOT NULL DEFAULT '{}'
            );
            """
        )


def read_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def read_yaml(path: Path, fallback: Any) -> Any:
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8")) or fallback
    except Exception:
        return fallback


def parse_dt(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def read_jsonl(path: Path, limit: int = 500) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    try:
        lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    except Exception:
        return []
    for line in lines[-limit:]:
        try:
            rows.append(json.loads(line))
        except Exception:
            continue
    return rows


def compute_trade_metrics(trades: list[dict[str, Any]]) -> Dict[str, Any]:
    pnls = [float(t.get("pnl_pct") or t.get("pnl") or 0) for t in trades]
    wins = sum(1 for p in pnls if p > 0)
    equity = 0.0
    peak = 0.0
    max_drawdown = 0.0
    for p in pnls:
        equity += p
        peak = max(peak, equity)
        max_drawdown = min(max_drawdown, equity - peak)
    return {
        "trade_count": len(pnls),
        "win_rate": round(wins / len(pnls), 4) if pnls else 0,
        "total_pnl_pct": round(sum(pnls), 5),
        "max_drawdown_pct": round(abs(max_drawdown), 5),
        "last_trade_pnl_pct": pnls[-1] if pnls else 0,
    }


def load_alphaforge_snapshot() -> Dict[str, Any]:
    snapshot = read_json(DATA_DIR / "alphaforge-snapshot.json", {})
    state = ALPHAFORGE / "state"
    trades_path = state / "trades.jsonl"
    heartbeat_path = state / "heartbeat.yaml"
    if state.exists():
        snapshot["goal"] = read_yaml(state / "goal.yaml", snapshot.get("goal", {}))
        snapshot["strategy"] = read_yaml(state / "strategy.yaml", snapshot.get("strategy", {}))
        trades = read_jsonl(trades_path, limit=1000)
        if trades:
            snapshot["recent_trades"] = trades[-12:]
            snapshot["metrics"] = {**snapshot.get("metrics", {}), **compute_trade_metrics(trades)}
        heartbeat = (
            read_yaml(heartbeat_path, None)
            or read_json(state / "heartbeat.json", None)
            or read_json(ALPHAFORGE / "heartbeat.json", None)
        )
        if heartbeat:
            snapshot["heartbeat"] = heartbeat
            snapshot["worker_status"] = heartbeat.get("status", "unknown")
            snapshot["asset"] = heartbeat.get("asset") or snapshot.get("goal", {}).get("asset") or snapshot.get("asset")
            snapshot["last_price"] = heartbeat.get("last_price")
    heartbeat = snapshot.get("heartbeat", {}) or {}
    heartbeat_at = parse_dt(heartbeat.get("timestamp") or heartbeat.get("updated_at") or heartbeat.get("time"))
    age_seconds = None
    fresh = False
    if heartbeat_at:
        if heartbeat_at.tzinfo is None:
            heartbeat_at = heartbeat_at.replace(tzinfo=timezone.utc)
        age_seconds = max(0, int((datetime.now(timezone.utc) - heartbeat_at).total_seconds()))
        fresh = age_seconds <= 900
    engine_events = []
    if heartbeat:
        engine_events.append({
            "type": "heartbeat",
            "timestamp": heartbeat.get("timestamp") or heartbeat.get("updated_at") or now_iso(),
            "message": f"Heartbeat {heartbeat.get('status', 'unknown')} · {heartbeat.get('asset', snapshot.get('asset', 'asset'))} · price {heartbeat.get('last_price', '--')}",
            "status": "ok" if fresh else "stale",
        })
    for trade in list(reversed(snapshot.get("recent_trades", [])[-6:])):
        engine_events.append({
            "type": "paper_trade",
            "timestamp": trade.get("timestamp"),
            "message": f"{trade.get('side', 'trade')} {trade.get('asset', '')} · PnL {round(float(trade.get('pnl_pct') or 0) * 100, 2)}% · {trade.get('reason', 'paper')}",
            "status": "ok" if float(trade.get("pnl_pct") or 0) >= 0 else "loss",
        })
    snapshot.setdefault("identity", {})["product"] = "Trading Room"
    snapshot.setdefault("identity", {})["module"] = "AlphaForge engine"
    snapshot.setdefault("identity", {})["relationship"] = "internal_module"
    snapshot["engine_state_found"] = state.exists()
    snapshot["engine_state_path"] = str(state)
    snapshot["engine_live"] = bool(state.exists() and fresh and heartbeat.get("status") == "ok")
    snapshot["engine_fresh"] = fresh
    snapshot["heartbeat_age_seconds"] = age_seconds
    snapshot["heartbeat_path"] = str(heartbeat_path)
    snapshot["trades_path"] = str(trades_path)
    snapshot["engine_events"] = engine_events
    snapshot["generated_at"] = now_iso()
    return snapshot


def infer_journal_tags(text: str) -> tuple[list[str], str, float]:
    low = text.lower()
    tags: list[str] = []
    weight = 0.15
    if any(w in low for w in ["revenge", "recuperar", "vingança"]):
        tags.append("revenge-risk"); weight += 0.35
    if any(w in low for w in ["fomo", "perdi o movimento", "não queria perder", "missed"]):
        tags.append("fomo"); weight += 0.25
    if any(w in low for w in ["ansioso", "ansiosa", "stress", "medo", "nervoso"]):
        tags.append("emotional-risk"); weight += 0.20
    if any(w in low for w in ["calmo", "calma", "disciplina", "esperei", "checklist"]):
        tags.append("discipline"); weight -= 0.10
    if not tags:
        tags.append("reflection")
    insight = "Padrão registado: " + ", ".join(tags) + ". O Trader Twin vai usar isto no próximo gate."
    return tags, insight, max(0.05, min(0.9, weight))


def compute_twin() -> Dict[str, Any]:
    twin = read_json(DATA_DIR / "trader-twin.json", {})
    with db() as con:
        sessions = con.execute("SELECT * FROM sessions ORDER BY id DESC LIMIT 30").fetchall()
        journal = con.execute("SELECT * FROM journal ORDER BY id DESC LIMIT 30").fetchall()
    blocked = sum(1 for s in sessions if not s["allowed"])
    revenge_notes = sum(1 for j in journal if "revenge-risk" in j["tags"])
    fomo_notes = sum(1 for j in journal if "fomo" in j["tags"])
    emotional_notes = sum(1 for j in journal if "emotional-risk" in j["tags"])
    base = float(twin.get("emotional_risk_base", 0.38))
    adaptive = min(0.92, max(0.05, base + blocked * 0.015 + revenge_notes * 0.05 + emotional_notes * 0.035 - sum(1 for j in journal if "discipline" in j["tags"]) * 0.02))
    twin["adaptive_emotional_risk"] = round(adaptive, 3)
    twin["learned_signals"] = {
        "sessions_seen": len(sessions),
        "blocked_or_closed": blocked,
        "revenge_notes": revenge_notes,
        "fomo_notes": fomo_notes,
        "emotional_notes": emotional_notes,
    }
    suggestions = []
    if revenge_notes or blocked >= 2:
        suggestions.append("Ativar pausa obrigatória de 30 minutos após impulso de recuperar ou 2 losses.")
    if fomo_notes:
        suggestions.append("Exigir pullback confirmado após candle grande/movimento perdido.")
    if emotional_notes:
        suggestions.append("Reduzir risco de sessão quando o check-in mental vier ansioso/stressado.")
    if not suggestions:
        suggestions.append("Continuar a recolher sessões e reflexões antes de endurecer regras.")
    twin["next_guardrail_suggestions"] = suggestions
    return twin


class SessionIn(BaseModel):
    allowed: bool = False
    mental: str = "normal"
    losses: int = 0
    risk: float = 0
    regime: str = "unknown"
    note: str = "sessão paper iniciada"
    payload: Dict[str, Any] = Field(default_factory=dict)


class SessionEnd(BaseModel):
    note: str = "sessão fechada"
    mental: str = "normal"
    losses: int = 0
    risk: float = 0
    regime: str = "unknown"
    payload: Dict[str, Any] = Field(default_factory=dict)


class JournalIn(BaseModel):
    text: str
    payload: Dict[str, Any] = Field(default_factory=dict)


class StrategyBlueprintIn(BaseModel):
    name: str = "Estratégia sem nome"
    market: str = ""
    description: str
    entry_rules: str = ""
    exit_rules: str = ""
    invalidation: str = ""
    risk_rules: str = ""
    uses_indicators: bool = False
    status: str = "draft"
    payload: Dict[str, Any] = Field(default_factory=dict)


class MT5ConnectionIn(BaseModel):
    label: str = "Conta MT5"
    mode: str = "manual"
    broker: str = ""
    account_login: str = ""
    server_name: str = ""
    payload: Dict[str, Any] = Field(default_factory=dict)


class MT5TradeIn(BaseModel):
    connection_id: Optional[int] = None
    source: str = "manual"
    symbol: str = "XAUUSD"
    side: str = ""
    opened_at: str = ""
    closed_at: str = ""
    lot: float = 0
    entry: float = 0
    exit: float = 0
    pnl: float = 0
    strategy: str = ""
    note: str = ""
    payload: Dict[str, Any] = Field(default_factory=dict)


class TradingGPSCheckIn(BaseModel):
    session_id: Optional[int] = None
    symbol: str = "XAUUSD"
    direction: str = ""
    reason: str = ""
    drivers: list[str] = Field(default_factory=list)
    guard_context: Dict[str, Any] = Field(default_factory=dict)


class TradingCopilotCheckIn(BaseModel):
    session_id: Optional[int] = None
    symbol: str = "XAUUSD"
    direction: str = ""
    lot: float = 0
    risk_reward: float = 0
    rules_checklist: Dict[str, Any] = Field(default_factory=dict)
    news_hits: list[str] = Field(default_factory=list)
    notes: str = ""


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/api/status")
def status() -> Dict[str, Any]:
    init_db()
    with db() as con:
        sessions = con.execute("SELECT COUNT(*) c FROM sessions").fetchone()["c"]
        notes = con.execute("SELECT COUNT(*) c FROM journal").fetchone()["c"]
    return {
        "ok": True,
        "mode": "paper-first",
        "time": now_iso(),
        "database": str(DB_PATH),
        "sessions": sessions,
        "journal_entries": notes,
        "trading_room_engine_found": (ALPHAFORGE / "state").exists(),
        "engine_module": "AlphaForge",
        "product": "Trading Room",
    }


@app.get("/api/room-engine")
def room_engine() -> Dict[str, Any]:
    """Unified Trading Room engine snapshot.

    AlphaForge is the internal strategy worker/engine module of Trading Room.
    """
    return load_alphaforge_snapshot()


@app.get("/api/alphaforge")
def alphaforge() -> Dict[str, Any]:
    # Backwards-compatible alias: old frontend/API clients may still call this.
    return load_alphaforge_snapshot()


@app.get("/api/trader-twin")
def trader_twin() -> Dict[str, Any]:
    return compute_twin()


@app.get("/api/regime")
def regime() -> Dict[str, Any]:
    snapshot = load_alphaforge_snapshot()
    return {
        "current": snapshot.get("regime", {}).get("current", "paper-observed"),
        "confidence": snapshot.get("regime", {}).get("confidence", 0),
        "drivers": snapshot.get("regime", {}).get("drivers", []),
        "allowed_strategies": snapshot.get("regime", {}).get("allowed_strategies", []),
        "blocked_strategies": snapshot.get("regime", {}).get("blocked_strategies", []),
        "source": "alphaforge_snapshot",
        "updated_at": snapshot.get("generated_at") or now_iso(),
    }


@app.get("/api/capital")
def capital() -> Dict[str, Any]:
    snapshot = load_alphaforge_snapshot()
    capital_state = snapshot.get("capital", {})
    return {
        "today_risk_budget_pct": capital_state.get("today_risk_budget_pct", 0),
        "live_capital_enabled": bool(capital_state.get("live_capital_enabled", False)),
        "mode": snapshot.get("mode", "paper"),
        "guards": capital_state.get("guards", ["paper-first", "live capital OFF"]),
        "source": "alphaforge_snapshot",
        "updated_at": snapshot.get("generated_at") or now_iso(),
    }



@app.get("/api/edge-tracking")
def edge_tracking() -> Dict[str, Any]:
    init_db()
    with db() as con:
        gps_recent = con.execute("SELECT created_at, verdict, score, payload FROM trading_gps_entries ORDER BY id DESC LIMIT 60").fetchall()
        mt5_recent = con.execute("SELECT created_at, symbol, side, pnl, strategy FROM mt5_manual_trades ORDER BY id DESC LIMIT 200").fetchall()
    weekday_names = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"]
    rows = []
    for r in gps_recent:
        try:
            payload = json.loads(r["payload"] or "{}")
        except Exception:
            payload = {}
        rows.append({
            "setup": payload.get("setup") or "gps",
            "asset": payload.get("symbol") or "XAU/USD",
            "pnl": payload.get("pnl") or 0,
            "session": "paper",
            "hour": (r["created_at"] or "")[11:13],
            "weekday": _safe_weekday(r["created_at"]),
        })
    for r in mt5_recent:
        try:
            payload = json.loads(r["payload"] or "{}")
        except Exception:
            payload = {}
        rows.append({
            "setup": r["strategy"] or "manual",
            "asset": r["symbol"] or "XAU/USD",
            "pnl": r["pnl"] or 0,
            "session": "mt5",
            "hour": (r["created_at"] or "")[11:13],
            "weekday": weekday_names[__import__("datetime").datetime.fromisoformat(str(r["created_at"]).replace("Z", "+00:00")).weekday()] if r["created_at"] else "Desconhecido",
        })
    buckets = {}
    for r in rows:
        key = (r["setup"], r["asset"], r["session"], r["weekday"])
        store = buckets.setdefault(key, {"wins":0,"losses":0,"pnl_sum":0,"count":0})
        store["count"] += 1
        if (r["pnl"] or 0) >= 0:
            store["wins"] += 1
        else:
            store["losses"] += 1
        store["pnl_sum"] += (r["pnl"] or 0)
    summary = []
    for (setup, asset, session, weekday), store in buckets.items():
        win_rate = round((store["wins"] / store["count"]) if store["count"] else 0, 4)
        avg_pnl = round((store["pnl_sum"] / store["count"]) if store["count"] else 0, 4)
        status = "stable"
        if store["count"] >= 3 and win_rate < 0.35:
            status = "alert"
        elif store["count"] >= 3 and win_rate < 0.45:
            status = "watch"
        summary.append({"setup": setup, "asset": asset, "session": session, "weekday": weekday, "count": store["count"], "win_rate": win_rate, "avg_pnl": avg_pnl, "status": status})
    summary = sorted(summary, key=lambda x: (x["status"] != "alert", -x["win_rate"]))[:12]
    alert_items = [x for x in summary if x["status"] != "stable"]
    return {"items": summary, "alerts": alert_items, "updated_at": now_iso()}

@app.get("/api/quantfund")
def quantfund() -> Dict[str, Any]:
    return _quantfund_snapshot()


@app.get("/api/quantfund/equity")
def quantfund_equity() -> Dict[str, Any]:
    snapshot = load_alphaforge_snapshot()
    trades = snapshot.get("recent_trades") or []
    if not isinstance(trades, list):
        trades = []
    equity = []
    if trades:
        balance = 1000.0
        prev_close = balance
        for t in trades:
            pnl = float((t or {}).get("pnl_pct") or (t or {}).get("pnl") or 0.0)
            if abs(pnl) <= 1.0:
                step = prev_close * pnl
            else:
                step = pnl
            balance = prev_close + step
            prev_close = balance
            equity.append({
                "time": (t or {}).get("timestamp") or (t or {}).get("opened_at") or (t or {}).get("time") or "",
                "equity": round(balance, 4),
                "pnl_step": round(pnl, 6),
            })
    return {"points": equity[-120:], "source": "alphaforge_snapshot_trades"}


@app.get("/api/edge-tracking")
def edge_tracking() -> Dict[str, Any]:
    init_db()
    today = now_iso()[:10]
    now_window = datetime.now(timezone.utc).isoformat(timespec="seconds")
    week_window = (datetime.now(timezone.utc) - __import__("datetime").timedelta(days=7)).isoformat(timespec="seconds")
    with db() as con:
        gps_recent = con.execute("SELECT created_at, verdict, score, payload FROM trading_gps_entries ORDER BY id DESC LIMIT 60").fetchall()
        copilot_recent = con.execute("SELECT created_at, decision, rules_pass, risk_reward, payload FROM trading_copilot_checks ORDER BY id DESC LIMIT 60").fetchall()
        mt5_recent = con.execute("SELECT created_at, symbol, side, pnl, strategy FROM mt5_manual_trades ORDER BY id DESC LIMIT 200").fetchall()
        alpha_trades = con.execute("SELECT created_at, symbol, side, pnl_pct, strategy FROM alpha_forge_trades ORDER BY id DESC LIMIT 200").fetchall()
    _safe_weekday = None
    try:
        _safe_weekday = _safe_weekday_h if "_safe_weekday_h" in str(globals()) else None
    except Exception:
        _safe_weekday = None
    def _pct(value, default=0.0):
        try:
            return round(float(value or default), 4)
        except Exception:
            return default

    def _safe_weekday(value: str) -> str:
        try:
            if not value:
                raise ValueError("empty")
            clean = str(value).replace("Z", "+00:00")
            date_part = clean.split("T")[0]
            year, month, day = [int(x) for x in date_part.split("-")]
            return datetime(year, month, day).strftime("%A")
        except Exception:
            return "Desconhecido"
    rows: list[dict[str, Any]] = []
    for r in gps_recent:
        payload = json.loads(r["payload"] or "{}")
        row = {
            "source": "gps",
            "created_at": r["created_at"],
            "verdict": r["verdict"],
            "score": r["score"],
            "pnl": 0.0,
            "asset": payload.get("symbol") or "XAU/USD",
            "setup": payload.get("setup") or "gps",
            "session": payload.get("session") or "desconhecida",
            "time_label": (r["created_at"] or "")[11:16] if (r["created_at"] or "") else "--:--",
            "weekday": __import__("datetime").datetime.fromisoformat(str(r["created_at"]).replace("Z", "+00:00")).strftime("%A") if r["created_at"] else "Desconhecido",
        }
        rows.append(row)
    for r in mt5_recent:
        rows.append({
            "source": "bridge",
            "created_at": r["created_at"],
            "verdict": "manual",
            "score": _pct(r["pnl"], 0.0),
            "pnl": _pct(r["pnl"], 0.0),
            "asset": r["symbol"] or "XAU/USD",
            "setup": r["strategy"] or "manual",
            "session": "mt5",
            "time_label": (r["created_at"] or "")[11:16] if (r["created_at"] or "") else "--:--",
            "weekday": _safe_weekday(r["created_at"]),
        })
    for r in alpha_trades:
        rows.append({
            "source": "alphaforge",
            "created_at": r["created_at"],
            "verdict": _pct(r["pnl_pct"]) >= 0 and "win" or "loss",
            "score": _pct(r["pnl_pct"]),
            "pnl": _pct(r["pnl_pct"]),
            "asset": r["symbol"] or "XAU/USD",
            "setup": r["strategy"] or "alphaforge",
            "session": "paper",
            "time_label": (r["created_at"] or "")[11:16] if (r["created_at"] or "") else "--:--",
            "weekday": __import__("datetime").datetime.fromisoformat(str(r["created_at"]).replace("Z", "+00:00")).strftime("%A") if r["created_at"] else "Desconhecido",
        })
    buckets: dict[str, Dict[str, Any]] = {}
    for r in rows:
        key = f"{r['setup']}|{r['asset']}|{r['session']}|{r['weekday']}"
        store = buckets.setdefault(key, {
            "setup": r["setup"],
            "asset": r["asset"],
            "session": r["session"],
            "weekday": r["weekday"],
            "count": 0,
            "wins": 0,
            "losses": 0,
            "pnl_sum": 0.0,
        })
        store["count"] = (store.get("count") or 0) + 1
        pnl = _pct(r["pnl"], 0.0)
        store["pnl_sum"] = (store.get("pnl_sum") or 0.0) + pnl
        if pnl >= 0:
            store["wins"] = (store.get("wins") or 0) + 1
        else:
            store["losses"] = (store.get("losses") or 0) + 1
    summary = []
    for store in buckets.values():
        count = store.get("count") or 0
        win_rate = round((store.get("wins") or 0) / count, 4) if count else 0.0
        avg_pnl = round((store.get("pnl_sum") or 0.0) / count, 4) if count else 0.0
        degradation = "stable"
        if count >= 3 and win_rate < 0.35:
            degradation = "alert"
        elif count >= 3 and win_rate < 0.45:
            degradation = "watch"
        summary.append({
            "setup": store.get("setup"),
            "asset": store.get("asset"),
            "session": store.get("session"),
            "weekday": store.get("weekday"),
            "count": count,
            "win_rate": win_rate,
            "avg_pnl": avg_pnl,
            "pnl_sum": round(store.get("pnl_sum") or 0.0, 5),
            "status": degradation,
        })
    summary_sorted = sorted(summary, key=lambda x: (x["status"] != "alert", x["win_rate"]))[:12]
    alerts = [s for s in summary_sorted if s["status"] != "stable"]
    return {
        "items": summary_sorted,
        "alerts": alerts,
        "updated_at": now_iso(),
    }


@app.get("/api/quantfund")
def quantfund() -> Dict[str, Any]:
    return _quantfund_snapshot()

def quantfund_equity() -> Dict[str, Any]:
    snapshot = load_alphaforge_snapshot()
    trades = snapshot.get("recent_trades") or []
    if not isinstance(trades, list):
        trades = []
    equity = []
    if trades:
        balance = 1000.0
        prev_close = balance
        for t in trades:
            pnl = float((t or {}).get("pnl_pct") or (t or {}).get("pnl") or 0.0)
            if abs(pnl) <= 1.0:
                step = prev_close * pnl
            else:
                step = pnl
            balance = prev_close + step
            prev_close = balance
            equity.append({
                "time": (t or {}).get("timestamp") or (t or {}).get("opened_at") or (t or {}).get("time") or "",
                "equity": round(balance, 4),
                "pnl_step": round(pnl, 6),
            })
    return {"points": equity[-120:], "source": "alphaforge_snapshot_trades"}


@app.get("/api/profile")
def profile() -> Dict[str, Any]:
    init_db()
    snapshot = load_alphaforge_snapshot()
    twin = compute_twin() if callable(compute_twin) else {}
    with db() as con:
        session_rows = con.execute("SELECT * FROM sessions ORDER BY id DESC LIMIT 5").fetchall()
    sessions = [dict(r) for r in session_rows] if session_rows else []
    return {
        "summary": {
            "papel": "trader",
            "modo": snapshot.get("mode", "paper"),
            "ativo": snapshot.get("asset", "XAU/USD"),
            "sessoes_ultimas": len(sessions),
        },
        "recent_sessions": sessions,
        "rules": twin.get("next_guardrail_suggestions") or ["Manter risco abaixo de 1% por trade"],
        "updated_at": now_iso(),
    }


def _quantfund_snapshot() -> Dict[str, Any]:
    snapshot = load_alphaforge_snapshot()
    metrics = snapshot.get("metrics", {}) or {}
    regime = snapshot.get("regime", {}) or {}
    return {
        "paper_trades": metrics.get("trade_count", 0),
        "win_rate": metrics.get("win_rate", 0.0),
        "total_pnl_pct": metrics.get("total_pnl_pct", 0.0),
        "max_drawdown_pct": metrics.get("max_drawdown_pct", 0.0),
        "regime_confidence": regime.get("confidence", 0.0),
        "regime_current": regime.get("current", "paper-observed"),
        "plan_items": [
            "Manter risco por trade abaixo do limite definido.",
            "Rever padrões emocionais do Trader Twin antes da próxima sessão.",
            "Validar checklist do Trading Copilot antes de operar.",
        ],
        "updated_at": now_iso(),
    }


@app.get("/api/visual/recent")
def visual_recent(limit: int = 12) -> Dict[str, Any]:
    init_db()
    with db() as con:
        gps = con.execute(
            "SELECT created_at, symbol, direction, reason, verdict, score, payload FROM trading_gps_entries ORDER BY id DESC LIMIT ?",
            (min(int(limit), 50),),
        ).fetchall()
    items=[]
    for r in gps:
        try:
            if isinstance(r["payload"], str):
                payload=json.loads(r["payload"] or "{}")
            else:
                payload={}
        except Exception:
            payload={}
        items.append({
            "created_at": r["created_at"],
            "asset": r["symbol"] or payload.get("symbol") or "XAU/USD",
            "direction": (r["direction"] or "setup").upper(),
            "note": r["reason"] or payload.get("setup") or "Setup GPS",
            "bias": "go" if r["verdict"]=="go" else ("wait" if r["verdict"]=="wait" else "block"),
            "score": r["score"],
        })
    return {"items": items, "source": "trading_gps_entries", "count": len(items), "updated_at": __import__("datetime").datetime.now(tz=__import__("datetime").timezone.utc).isoformat()}


@app.get("/api/strategies")
def strategies() -> Dict[str, Any]:
    init_db()
    snapshot = load_alphaforge_snapshot()
    active = snapshot.get("strategy", {})
    marketplace = snapshot.get("marketplace", [])
    with db() as con:
        rows = con.execute("SELECT * FROM strategy_blueprints ORDER BY id DESC LIMIT 50").fetchall()
    return {
        "active": active,
        "blueprints": [row_to_strategy(r) for r in rows],
        "marketplace": marketplace,
        "paper_trade_count": snapshot.get("metrics", {}).get("trade_count", 0),
        "source": "alphaforge_state_and_human_blueprints",
        "updated_at": snapshot.get("generated_at") or now_iso(),
    }


def row_to_strategy(r: sqlite3.Row) -> Dict[str, Any]:
    d = dict(r)
    d["uses_indicators"] = bool(d.get("uses_indicators"))
    d["payload"] = json.loads(d.get("payload") or "{}")
    return d


@app.post("/api/strategies")
def strategy_create(item: StrategyBlueprintIn) -> Dict[str, Any]:
    init_db()
    with db() as con:
        cur = con.execute(
            """
            INSERT INTO strategy_blueprints(
              created_at, name, market, description, entry_rules, exit_rules,
              invalidation, risk_rules, uses_indicators, status, payload
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                now_iso(), item.name.strip() or "Estratégia sem nome", item.market.strip(),
                item.description.strip(), item.entry_rules.strip(), item.exit_rules.strip(),
                item.invalidation.strip(), item.risk_rules.strip(), int(item.uses_indicators),
                item.status.strip() or "draft", json.dumps(item.payload),
            ),
        )
        row = con.execute("SELECT * FROM strategy_blueprints WHERE id=?", (cur.lastrowid,)).fetchone()
    return {"ok": True, "strategy": row_to_strategy(row)}


@app.get("/api/strategies/{strategy_id}")
def strategy_get(strategy_id: int) -> Dict[str, Any]:
    init_db()
    with db() as con:
        row = con.execute("SELECT * FROM strategy_blueprints WHERE id=?", (strategy_id,)).fetchone()
    return {"strategy": row_to_strategy(row) if row else None}


@app.get("/api/marketplace")
def marketplace_list(limit: int = 50) -> Dict[str, Any]:
    init_db()
    with db() as con:
        rows = con.execute(
            "SELECT * FROM marketplace_strategies ORDER BY score DESC, trust DESC, id DESC LIMIT ?",
            (min(limit, 200),),
        ).fetchall()
    items = [{
        "id": r["id"],
        "created_at": r["created_at"],
        "name": r["name"],
        "regime": r["regime"],
        "status": r["status"],
        "score": r["score"],
        "trust": r["trust"],
        "win_rate": r["win_rate"],
        "max_drawdown": r["max_drawdown"],
        "description": r["description"],
        "payload": json.loads(r.get("payload") or "{}"),
    } for r in rows]
    snapshot_marketplace = load_alphaforge_snapshot().get("marketplace", [])
    return {
        "items": items or _fallback_marketplace(snapshot_marketplace),
        "source": "marketplace_strategies" if items else "alphaforge_snapshot_fallback",
        "updated_at": now_iso(),
    }


def _fallback_marketplace(snapshot_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    mapping = {
        "name": "name",
        "regime": "regime",
        "status": "status",
        "score": "score",
        "trust": "trust",
        "win_rate": "win_rate",
        "max_drawdown": "max_drawdown",
        "description": "description",
    }

    cleaned = []
    for item in snapshot_items:
        mapped = {}
        for source_key, target_key in mapping.items():
            value = item.get(source_key)
            if value is None:
                if target_key == "score":
                    value = _bucket_score_from_regime_confidence(item.get("regime_confidence"))
                elif target_key == "trust":
                    value = round((item.get("regime_confidence") or 0), 3)
                elif target_key in {"win_rate", "max_drawdown"}:
                    value = 0
                else:
                    value = ""
            if target_key in {"win_rate", "max_drawdown"}:
                value = float(value or 0)
            mapped[target_key] = value
        cleaned.append(mapped)
    return cleaned[:50]


def _bucket_score_from_regime_confidence(value: float | None) -> float:
    try:
        score = round(float(value or 0) * 100, 1)
    except Exception:
        score = 0.0
    return score


@app.get("/api/quantfund")
def quantfund() -> Dict[str, Any]:
    snapshot = load_alphaforge_snapshot()
    metrics = snapshot.get("metrics", {}) or {}
    regime = snapshot.get("regime", {}) or {}
    sessions_count = 0
    discipline_score = 0.0
    try:
        with db() as con:
            sessions_count = con.execute("SELECT COUNT(*) c FROM sessions").fetchone()["c"]
            journal_count = con.execute("SELECT COUNT(*) c FROM journal").fetchone()["c"]
        if sessions_count:
            discipline_score = round(min(1.0, max(0.0, (journal_count / (sessions_count * 3)))), 3)
    except Exception:
        discipline_score = 0.0
    return {
        "paper_trades": metrics.get("trade_count", 0),
        "win_rate": metrics.get("win_rate", 0.0),
        "total_pnl_pct": metrics.get("total_pnl_pct", 0.0),
        "max_drawdown_pct": metrics.get("max_drawdown_pct", 0.0),
        "regime_confidence": regime.get("confidence", 0.0),
        "regime_current": regime.get("current", "paper-observed"),
        "sessions_count": sessions_count,
        "discipline_score": discipline_score,
        "daily_plan": {
            "focus": "Proteger capital e manter consistência.",
            "actions": [
                "Rever as últimas 3 sessões.",
                "Aplicar checklist antes de operar.",
                "Manter risco por sessão abaixo do limite."
            ]
        },
        "updated_at": now_iso(),
    }


class MarketplaceStrategyIn(BaseModel):
    name: str = "Estratégia auditada"
    regime: str = "any"
    status: str = "paper"
    score: float = 0
    trust: float = 0
    win_rate: float = 0
    max_drawdown: float = 0
    description: str = ""
    payload: Dict[str, Any] = Field(default_factory=dict)


@app.post("/api/marketplace")
def marketplace_create(item: MarketplaceStrategyIn) -> Dict[str, Any]:
    init_db()
    with db() as con:
        cur = con.execute(
            """
            INSERT INTO marketplace_strategies(
              created_at, name, regime, status, score, trust, win_rate, max_drawdown, description, payload
            ) VALUES(?,?,?,?,?,?,?,?,?,?)
            """,
            (
                now_iso(),
                item.name.strip() or "Estratégia auditada",
                item.regime.strip() or "any",
                item.status.strip() or "paper",
                float(item.score),
                float(item.trust),
                float(item.win_rate),
                float(item.max_drawdown),
                item.description.strip(),
                json.dumps(item.payload),
            ),
        )
        row = con.execute("SELECT * FROM marketplace_strategies WHERE id=?", (cur.lastrowid,)).fetchone()
    return {"ok": True, "strategy": dict(row)}


def row_to_mt5_connection(r: sqlite3.Row) -> Dict[str, Any]:
    d = dict(r)
    d["payload"] = json.loads(d.get("payload") or "{}")
    return d


def row_to_mt5_trade(r: sqlite3.Row) -> Dict[str, Any]:
    d = dict(r)
    d["payload"] = json.loads(d.get("payload") or "{}")
    return d


def compute_mt5_metrics(rows: list[sqlite3.Row]) -> Dict[str, Any]:
    pnls = [float(r["pnl"] or 0) for r in rows]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p < 0]
    equity = 0.0
    peak = 0.0
    max_drawdown = 0.0
    loss_streak = 0
    max_loss_streak = 0
    for p in pnls:
        equity += p
        peak = max(peak, equity)
        max_drawdown = min(max_drawdown, equity - peak)
        if p < 0:
            loss_streak += 1
            max_loss_streak = max(max_loss_streak, loss_streak)
        elif p > 0:
            loss_streak = 0
    gross_win = sum(wins)
    gross_loss = abs(sum(losses))
    return {
        "trade_count": len(pnls),
        "win_rate": round(len(wins) / len(pnls), 4) if pnls else 0,
        "total_pnl": round(sum(pnls), 2),
        "avg_win": round(gross_win / len(wins), 2) if wins else 0,
        "avg_loss": round(sum(losses) / len(losses), 2) if losses else 0,
        "profit_factor": round(gross_win / gross_loss, 2) if gross_loss else (round(gross_win, 2) if gross_win else 0),
        "max_drawdown": round(abs(max_drawdown), 2),
        "loss_streak": max_loss_streak,
    }


@app.get("/api/mt5/accounts")
def mt5_accounts() -> Dict[str, Any]:
    init_db()
    with db() as con:
        accounts = con.execute("SELECT * FROM mt5_connections ORDER BY id DESC LIMIT 50").fetchall()
        trades = con.execute("SELECT * FROM mt5_manual_trades ORDER BY id DESC LIMIT 200").fetchall()
    return {
        "accounts": [row_to_mt5_connection(r) for r in accounts],
        "recent_trades": [row_to_mt5_trade(r) for r in trades[:30]],
        "metrics": compute_mt5_metrics(list(reversed(trades))),
        "modes": ["iphone_manual", "import_history", "mt5_bridge"],
        "updated_at": now_iso(),
    }


@app.post("/api/mt5/accounts")
def mt5_account_create(item: MT5ConnectionIn) -> Dict[str, Any]:
    init_db()
    token = "tr_mt5_" + uuid.uuid4().hex[:16]
    with db() as con:
        cur = con.execute(
            """
            INSERT INTO mt5_connections(created_at, label, mode, token, status, broker, account_login, server_name, payload)
            VALUES(?,?,?,?,?,?,?,?,?)
            """,
            (
                now_iso(), item.label.strip() or "Conta MT5", item.mode.strip() or "manual", token, "setup",
                item.broker.strip(), item.account_login.strip(), item.server_name.strip(), json.dumps(item.payload),
            ),
        )
        row = con.execute("SELECT * FROM mt5_connections WHERE id=?", (cur.lastrowid,)).fetchone()
    return {"ok": True, "account": row_to_mt5_connection(row)}


@app.post("/api/mt5/trades")
def mt5_trade_add(item: MT5TradeIn) -> Dict[str, Any]:
    init_db()
    with db() as con:
        cur = con.execute(
            """
            INSERT INTO mt5_manual_trades(
              created_at, connection_id, source, symbol, side, opened_at, closed_at,
              lot, entry, exit, pnl, strategy, note, payload
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                now_iso(), item.connection_id, item.source.strip() or "manual", item.symbol.strip().upper(),
                item.side.strip(), item.opened_at.strip(), item.closed_at.strip(), item.lot, item.entry,
                item.exit, item.pnl, item.strategy.strip(), item.note.strip(), json.dumps(item.payload),
            ),
        )
        row = con.execute("SELECT * FROM mt5_manual_trades WHERE id=?", (cur.lastrowid,)).fetchone()
    return {"ok": True, "trade": row_to_mt5_trade(row)}


@app.get("/api/mt5/metrics")
def mt5_metrics() -> Dict[str, Any]:
    init_db()
    with db() as con:
        rows = con.execute("SELECT * FROM mt5_manual_trades ORDER BY id ASC LIMIT 1000").fetchall()
    return {"metrics": compute_mt5_metrics(rows), "updated_at": now_iso()}


def score_liquidity(item: TradingGPSCheckIn, snapshot: Dict[str, Any]) -> Dict[str, Any]:
    drivers: list[str] = []
    risk = 0.0
    regime = snapshot.get("regime", {}) or {}
    regime_name = str(regime.get("current", "")).lower()
    regime_conf = float(regime.get("confidence", 0) or 0)
    if "low" in regime_name or "illiquid" in regime_name or regime_conf < 0.35:
        risk += 0.25
        drivers.append("baixa liquidez/regime")
    if snapshot.get("heartbeat_age_seconds") is None:
        risk += 0.05
        drivers.append("sem dados recentes")
    if any(x in (item.reason or "").lower() for x in ["spoof", "stop hunt", "absor"]):
        risk += 0.15
        drivers.append("comportamento suspeito")
    guard = item.guard_context or {}
    spread = float(guard.get("spread", -1))
    if spread >= 0:
        risk += min(0.25, spread / 100)
        if spread > 35:
            drivers.append("spread elevado")
    session_risk = float(guard.get("session_risk", TWIN.get("adaptive_emotional_risk", 0.38))) if False else float(guard.get("session_risk", 0.38))
    risk = min(0.95, max(0.0, risk + session_risk * 0.35))
    score = max(0, min(100, int(round((1 - risk) * 100))))
    blocked = 1 if score < 40 or session_risk >= 0.72 else 0
    return {"score": score, "risk": round(risk, 3), "drivers": drivers or ["condições insuficientes"], "blocked": bool(blocked)}


@app.get("/api/trading-gps")
def trading_gps(session_id: Optional[int] = None) -> Dict[str, Any]:
    snapshot = load_alphaforge_snapshot()
    active = {"id": session_id}
    return {
        "verdict": "wait",
        "market": snapshot.get("asset") or "XAU/USD",
        "regime": snapshot.get("regime", {}).get("current", "paper-observed"),
        "regime_confidence": snapshot.get("regime", {}).get("confidence", 0),
        "engine_live": bool(snapshot.get("engine_live")),
        "trades_count": (snapshot.get("metrics") or {}).get("trade_count", 0),
        "win_rate": (snapshot.get("metrics") or {}).get("win_rate", 0),
        "updated_at": snapshot.get("generated_at") or now_iso(),
        "guidance": "A maioria das perdas vem de trading em excesso. Usa a nota como filtro, não como entrada.",
    }


@app.post("/api/trading-gps/check")
def trading_gps_check(item: TradingGPSCheckIn) -> Dict[str, Any]:
    snapshot = load_alphaforge_snapshot()
    result = score_liquidity(item, snapshot)
    verdict = "wait"
    if result["score"] >= 70 and not result["blocked"]:
        verdict = "operate"
    elif result["score"] < 40 or result["blocked"]:
        verdict = "do_not_trade"
    init_db()
    with db() as con:
        cur = con.execute(
            "INSERT INTO trading_gps_entries(created_at, session_id, symbol, direction, reason, verdict, score, drivers, blocked, payload) VALUES(?,?,?,?,?,?,?,?,?,?)",
            (
                now_iso(), item.session_id, item.symbol, item.direction, item.reason, verdict, result["score"],
                json.dumps(result["drivers"]), int(result["blocked"]), json.dumps({"risk": result["risk"]}),
            ),
        )
        row_id = cur.lastrowid
    return {"ok": True, "id": row_id, "verdict": verdict, **result}


@app.get("/api/trading-copilot")
def trading_copilot(session_id: Optional[int] = None) -> Dict[str, Any]:
    snapshot = load_alphaforge_snapshot()
    twin = compute_twin() if False else read_json(DATA_DIR / "trader-twin.json", {})
    return {
        "mode": "copilot",
        "trader_risk": twin.get("adaptive_emotional_risk", twin.get("emotional_risk_base", 0.38)),
        "rules": [
            "Checklist de entrada: tendência / liquidez / estrutura / notícia / plafond de risco",
            "RR mínimo preferencial: 1.6",
            "Novo news spike 5m = isolar entrada",
            "2 perdas na sessão = reduzir risco",
            "Revenge trading = bloqueio automático",
        ],
        "updated_at": now_iso(),
    }


@app.post("/api/trading-copilot/check")
def trading_copilot_check(item: TradingCopilotCheckIn) -> Dict[str, Any]:
    twin = read_json(DATA_DIR / "trader-twin.json", {})
    trader_risk = float(twin.get("adaptive_emotional_risk", twin.get("emotional_risk_base", 0.38)))
    rules = item.rules_checklist or {}
    required_keys = ["trend", "liquidity", "structure", "news", "risk_ok"]
    rules_pass = sum(1 for k in required_keys if bool(rules.get(k)))
    decision = "blocked"
    if rules_pass == len(required_keys) and item.risk_reward >= 1.6 and trader_risk < 0.72 and item.lot > 0:
        decision = "approved"
    elif rules_pass == len(required_keys) and item.lot > 0:
        decision = "conditional"
    blocked = 1 if decision == "blocked" else 0
    init_db()
    with db() as con:
        cur = con.execute(
            "INSERT INTO trading_copilot_checks(created_at, session_id, symbol, direction, lot, risk_reward, rules_pass, news_hits, decision, payload) VALUES(?,?,?,?,?,?,?,?,?,?)",
            (
                now_iso(), item.session_id, item.symbol, item.direction, item.lot, item.risk_reward, rules_pass,
                json.dumps(item.news_hits), decision, json.dumps(item.rules_checklist),
            ),
        )
        row_id = cur.lastrowid
    return {"ok": True, "id": row_id, "decision": decision, "rules_pass": rules_pass, "blocked": bool(blocked)}



def row_to_session(r: sqlite3.Row) -> Dict[str, Any]:
    d = dict(r)
    d["allowed"] = bool(d["allowed"])
    d["payload"] = json.loads(d.get("payload") or "{}")
    d["active"] = d.get("ended_at") is None and d.get("action") == "start"
    return d


@app.get("/api/session/active")
def session_active() -> Dict[str, Any]:
    init_db()
    with db() as con:
        row = con.execute("SELECT * FROM sessions ORDER BY id DESC LIMIT 1").fetchone()
    if row and row["action"] == "start" and row["ended_at"] is None:
        return {"active": row_to_session(row)}
    return {"active": None}


@app.post("/api/session/end")
def session_end(item: SessionEnd) -> Dict[str, Any]:
    init_db()
    created = now_iso()
    with db() as con:
        row = con.execute("SELECT * FROM sessions ORDER BY id DESC LIMIT 1").fetchone()
        if row and row["action"] == "start" and row["ended_at"] is None:
            sid = row["id"]
            merged_payload = {**json.loads(row["payload"] or "{}"), **item.payload, "reviewed": True}
            con.execute(
                "UPDATE sessions SET ended_at=?, mental=?, losses=?, risk=?, regime=?, note=?, payload=? WHERE id=?",
                (created, item.mental, item.losses, item.risk, item.regime, item.note, json.dumps(merged_payload), sid),
            )
        else:
            cur = con.execute(
                "INSERT INTO sessions(started_at, ended_at, action, allowed, mental, losses, risk, regime, note, payload) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (created, created, "end", 0, item.mental, item.losses, item.risk, item.regime, item.note, json.dumps(item.payload)),
            )
            sid = cur.lastrowid
        tags, insight, weight = infer_journal_tags(item.note)
        con.execute(
            "INSERT INTO journal(created_at, text, tags, insight, payload) VALUES(?,?,?,?,?)",
            (created, "Session review: " + item.note, json.dumps(tags), insight, json.dumps({"source":"session_end", "session_id": sid, "weight": weight})),
        )
    return {"ok": True, "id": sid, "insight": insight, "closed_at": created}


@app.get("/api/sessions")
def sessions(limit: int = 30) -> Dict[str, Any]:
    init_db()
    with db() as con:
        rows = con.execute("SELECT * FROM sessions ORDER BY id DESC LIMIT ?", (min(limit, 100),)).fetchall()
    items = []
    for r in rows:
        items.append(row_to_session(r))
    return {"items": items}


@app.post("/api/journal")
def journal_add(item: JournalIn) -> Dict[str, Any]:
    init_db()
    tags, insight, weight = infer_journal_tags(item.text)
    with db() as con:
        cur = con.execute(
            "INSERT INTO journal(created_at, text, tags, insight, payload) VALUES(?,?,?,?,?)",
            (now_iso(), item.text.strip(), json.dumps(tags), insight, json.dumps({**item.payload, "weight": weight})),
        )
        jid = cur.lastrowid
    return {"ok": True, "id": jid, "tags": tags, "insight": insight}


@app.get("/api/journal")
def journal_list(limit: int = 30) -> Dict[str, Any]:
    init_db()
    with db() as con:
        rows = con.execute("SELECT * FROM journal ORDER BY id DESC LIMIT ?", (min(limit, 100),)).fetchall()
    items = []
    for r in rows:
        d = dict(r)
        d["tags"] = json.loads(d.get("tags") or "[]")
        d["payload"] = json.loads(d.get("payload") or "{}")
        items.append(d)
    return {"items": items}


@app.get("/api/journal/daily-report")
def journal_daily_report() -> Dict[str, Any]:
    init_db()
    today = now_iso()[:10]
    with db() as con:
        rows = con.execute("SELECT * FROM journal WHERE created_at >= ? ORDER BY id DESC LIMIT 200", (today,)).fetchall()
    items = []
    for r in rows:
        d = dict(r)
        d["tags"] = json.loads(d.get("tags") or "[]")
        d["payload"] = json.loads(d.get("payload") or "{}")
        items.append(d)
    entries = len(items)
    tags: list[str] = []
    for d in items:
        tags.extend([t for t in d.get("tags", []) if t])
    tag_counts: dict[str, int] = {}
    for t in tags:
        tag_counts[t] = tag_counts.get(t, 0) + 1
    top_tags = sorted(tag_counts.items(), key=lambda x: (x[1], x[0]), reverse=True)[:8]
    recent_insights = [d.get("insight") for d in items[:8] if d.get("insight")]
    insights_clean = []
    seen = set()
    for ins in recent_insights:
        if ins and ins not in seen:
            seen.add(ins)
            insights_clean.append(ins)
    today_pnl_notes = []
    for d in items:
        txt = d.get("text", "")
        lower = txt.lower()
        if "resultado positivo" in lower or "positivo" in lower:
            today_pnl_notes.append("positive")
        elif "resultado negativo" in lower:
            today_pnl_notes.append("negative")
    positive = sum(1 for x in today_pnl_notes if x == "positive")
    negative = sum(1 for x in today_pnl_notes if x == "negative")
    summary_parts = []
    if today_pnl_notes:
        summary_parts.append(f"Hoje: {positive} positivo(s), {negative} negativo(s).")
    if items:
        summary_parts.append(f"{entries} entradas no journal hoje.")
    if top_tags:
        summary_parts.append("Tags mais frequentes: " + ", ".join(f"{t} ({c})" for t, c in top_tags))
    if recent_insights:
        summary_parts.append("Insight principal: " + recent_insights[0])
    summary = "Relatório diário automático. " + " ".join(summary_parts) if summary_parts else "Ainda sem entradas suficientes para o relatório de hoje."
    headline = "Relatório diário automático"
    return {
        "headline": headline,
        "date": today,
        "summary": summary,
        "top_tags": [{"tag": t, "count": c} for t, c in top_tags],
        "entry_count": entries,
        "pnl_bias": {"positive": positive, "negative": negative},
        "insights": insights_clean[:6],
        "updated_at": now_iso(),
    }


@app.get("/api/psychology/patterns")
def psychology_patterns() -> Dict[str, Any]:
    init_db()
    with db() as con:
        sessions = con.execute("SELECT started_at, mental, losses, risk, regime, note, allowed FROM sessions ORDER BY id DESC LIMIT 300").fetchall()
    weekday_names = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"]
    weekdays: dict[str, Dict[str, int]] = {}
    hours: dict[str, Dict[str, int]] = {}
    for s in sessions:
        key = str(s["started_at"])
        dt = key.replace("Z", "+00:00")
        try:
            from datetime import datetime, timezone
            dtobj = datetime.fromisoformat(dt)
            wd = dtobj.strftime("%A")
            hr = dtobj.strftime("%H")
        except Exception:
            continue
        w = weekdays.setdefault(wd, {"total": 0, "losses": 0, "allowed": 0, "high_risk": 0})
        w["total"] = (w.get("total") or 0) + 1
        w["losses"] = (w.get("losses") or 0) + int(s["losses"] or 0)
        w["allowed"] = (w.get("allowed") or 0) + int(s["allowed"] or 0)
        w["high_risk"] = (w.get("high_risk") or 0) + int((s["risk"] or 0) >= 0.7)
        h = hours.setdefault(hr, {"total": 0, "losses": 0, "high_risk": 0})
        h["total"] = (h.get("total") or 0) + 1
        h["losses"] = (h.get("losses") or 0) + int(s["losses"] or 0)
        h["high_risk"] = (h.get("high_risk") or 0) + int((s["risk"] or 0) >= 0.7)

    weekdays_series = []
    hours_series = []
    for wd in weekday_names:
        d = weekdays.get(wd)
        if not d:
            continue
        total = d.get("total", 0)
        weekdays_series.append({
            "weekday": wd,
            "sessions": total,
            "loss_sessions": d.get("losses", 0),
            "allowed_rate": round((d.get("allowed", 0) / total), 3) if total else 0,
            "high_risk_rate": round((d.get("high_risk", 0) / total), 3) if total else 0,
        })
    for hr in range(24):
        h = hours.get(str(hr).zfill(2))
        if not h:
            hours_series.append({"hour": str(hr).zfill(2), "sessions": 0, "loss_sessions": 0, "high_risk_rate": 0})
            continue
        total = h.get("total", 0)
        hours_series.append({
            "hour": str(hr).zfill(2),
            "sessions": total,
            "loss_sessions": h.get("losses", 0),
            "high_risk_rate": round((h.get("high_risk", 0) / total), 3) if total else 0,
        })
    peak_risk_hour = sorted(hours_series, key=lambda x: (x.get("high_risk_rate") or 0, x.get("sessions") or 0), reverse=True)[:3]
    peak_risk_day = sorted(weekdays_series, key=lambda x: (x.get("high_risk_rate") or 0, x.get("sessions") or 0), reverse=True)[:3]
    alerts = []
    if peak_risk_hour and (peak_risk_hour[0].get("high_risk_rate") or 0) > 0:
        alerts.append(f"Horário de maior risco: {peak_risk_hour[0]['hour']}h")
    if peak_risk_day and (peak_risk_day[0].get("high_risk_rate") or 0) > 0:
        alerts.append(f"Dia com mais risco emocional: {peak_risk_day[0]['weekday']}")
    return {
        "weekdays_sessions": weekdays_series,
        "hours_sessions": hours_series,
        "peak_risk_hour": peak_risk_hour,
        "peak_risk_day": peak_risk_day,
        "alerts": alerts,
        "updated_at": now_iso(),
    }


@app.get("/sw.js")
def service_worker() -> FileResponse:
    return FileResponse(ROOT / "sw.js")


@app.get("/api/psychology")
def psychology() -> Dict[str, Any]:
    twin = compute_twin()
    return {
        "score": round((1 - min(1, max(0, twin.get("adaptive_emotional_risk", twin.get("emotional_risk_base", 0.38))))) * 100, 1),
        "emotional_risk": twin.get("adaptive_emotional_risk", twin.get("emotional_risk_base", 0)),
        "revenge_risk": twin.get("revenge_risk_base", 0),
        "rules": twin.get("next_guardrail_suggestions", []),
        "learned_signals": twin.get("learned_signals", {}),
        "updated_at": now_iso(),
    }

@app.get("/api/trading-room/chats")
def trading_room_chats(limit: int = 50) -> Dict[str, Any]:
    init_db()
    with db() as con:
        rows = con.execute("SELECT * FROM journal ORDER BY id DESC LIMIT ?", (min(int(limit), 200),)).fetchall()
    out = []
    for r in rows:
        out.append({
            "id": r["id"],
            "created_at": r["created_at"],
            "author": "system",
            "message": r["text"],
            "type": "diary",
        })
    return {"ok": True, "items": out}

@app.post("/api/trading-room/messages")
def trading_room_message(payload: Dict[str, Any] = Field(default_factory=dict)) -> Dict[str, Any]:
    init_db()
    message = str(payload.get("message") or "").strip()
    if not message:
        return {"ok": False}
    with db() as con:
        cur = con.execute(
            "INSERT INTO journal(created_at, text, tags, insight, payload) VALUES(?,?,?,?,?)",
            (now_iso(), message, "[]", "", json.dumps({"source": "trading-room"}, ensure_ascii=False)),
        )
        row_id = cur.lastrowid
    return {"ok": True, "id": row_id, "created_at": now_iso(), "author": "Inês Traders", "message": message, "type": "chat"}

@app.get("/api/market/news-impact")
def market_news_impact() -> Dict[str, Any]:
    return {
        "items": [
            {"event": "CPI/m (MoM)", "impact": "ALTO", "time": "14:30"},
            {"event": "Fed Chair Powell", "impact": "ALTO", "time": "19:00"},
            {"event": "GDP (QoQ)", "impact": "MÉDIO", "time": "08:30"},
        ],
        "updated_at": now_iso(),
    }

@app.get("/api/market/score")
def market_score() -> Dict[str, Any]:
    snapshot = load_alphaforge_snapshot()
    metrics = snapshot.get("metrics") or {}
    asset = snapshot.get("asset") or "XAU/USD"
    return {
        "asset": asset,
        "score": 82,
        "metrics": {
            "trade_count": metrics.get("trade_count", 0),
            "win_rate": metrics.get("win_rate", 0),
            "total_pnl_pct": metrics.get("total_pnl_pct", 0),
        },
        "updated_at": now_iso(),
    }
def index() -> FileResponse:
    return FileResponse(ROOT / "index.html")
