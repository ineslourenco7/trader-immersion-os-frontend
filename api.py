from __future__ import annotations

import json
import sqlite3
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
ALPHAFORGE = Path("/home/ines/workspace/alpha-forge")

app = FastAPI(title="Trader Immersion OS API", version="0.1.0")
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


def load_alphaforge_snapshot() -> Dict[str, Any]:
    snapshot = read_json(DATA_DIR / "alphaforge-snapshot.json", {})
    state = ALPHAFORGE / "state"
    if state.exists():
        snapshot["goal"] = read_yaml(state / "goal.yaml", snapshot.get("goal", {}))
        snapshot["strategy"] = read_yaml(state / "strategy.yaml", snapshot.get("strategy", {}))
        trades_path = state / "trades.jsonl"
        trades = []
        if trades_path.exists():
            for line in trades_path.read_text(encoding="utf-8", errors="ignore").splitlines()[-50:]:
                try:
                    trades.append(json.loads(line))
                except Exception:
                    continue
        if trades:
            snapshot["recent_trades"] = trades[-12:]
            snapshot.setdefault("metrics", {})["trade_count"] = len(trades)
        heartbeat = read_json(state / "heartbeat.json", None) or read_json(ALPHAFORGE / "heartbeat.json", None)
        if heartbeat:
            snapshot["heartbeat"] = heartbeat
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
        "alphaforge_state_found": (ALPHAFORGE / "state").exists(),
    }


@app.get("/api/alphaforge")
def alphaforge() -> Dict[str, Any]:
    return load_alphaforge_snapshot()


@app.get("/api/trader-twin")
def trader_twin() -> Dict[str, Any]:
    return compute_twin()


@app.post("/api/session/start")
def session_start(item: SessionIn) -> Dict[str, Any]:
    init_db()
    with db() as con:
        cur = con.execute(
            "INSERT INTO sessions(started_at, action, allowed, mental, losses, risk, regime, note, payload) VALUES(?,?,?,?,?,?,?,?,?)",
            (now_iso(), "start", int(item.allowed), item.mental, item.losses, item.risk, item.regime, item.note, json.dumps(item.payload)),
        )
        sid = cur.lastrowid
    return {"ok": True, "id": sid, "session": {"id": sid, **item.dict()}}


@app.post("/api/session/end")
def session_end(item: SessionEnd) -> Dict[str, Any]:
    init_db()
    created = now_iso()
    with db() as con:
        cur = con.execute(
            "INSERT INTO sessions(started_at, ended_at, action, allowed, mental, losses, risk, regime, note, payload) VALUES(?,?,?,?,?,?,?,?,?,?)",
            (created, created, "end", 0, item.mental, item.losses, item.risk, item.regime, item.note, json.dumps(item.payload)),
        )
        sid = cur.lastrowid
        tags, insight, weight = infer_journal_tags(item.note)
        con.execute(
            "INSERT INTO journal(created_at, text, tags, insight, payload) VALUES(?,?,?,?,?)",
            (created, "Session review: " + item.note, json.dumps(tags), insight, json.dumps({"source":"session_end", "weight": weight})),
        )
    return {"ok": True, "id": sid, "insight": insight}


@app.get("/api/sessions")
def sessions(limit: int = 30) -> Dict[str, Any]:
    init_db()
    with db() as con:
        rows = con.execute("SELECT * FROM sessions ORDER BY id DESC LIMIT ?", (min(limit, 100),)).fetchall()
    items = []
    for r in rows:
        d = dict(r)
        d["allowed"] = bool(d["allowed"])
        d["payload"] = json.loads(d.get("payload") or "{}")
        items.append(d)
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


@app.get("/manifest.webmanifest")
def manifest() -> FileResponse:
    return FileResponse(ROOT / "manifest.webmanifest")


@app.get("/sw.js")
def service_worker() -> FileResponse:
    return FileResponse(ROOT / "sw.js")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(ROOT / "index.html")
