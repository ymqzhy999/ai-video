r"""
ComfyUI Workflow Studio — optional FastAPI companion server.

The iOS / web client works standalone with IndexedDB. This server is only
needed if you want:
  * optional server-side workflow storage (SQLite)
  * an API proxy that avoids browser CORS restrictions

Run:
    python -m venv .venv
    source .venv/bin/activate        # Windows: .venv\Scripts\activate
    pip install -r requirements.txt
    uvicorn main:app --reload --host 0.0.0.0 --port 8000

Never put these keys in a public server. The proxy accepts the user's key in
the x-api-key header for each request and does not persist it.
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("STUDIO_DB", BASE_DIR / "studio.db"))
ALLOWED_ORIGINS = [origin.strip() for origin in os.environ.get("STUDIO_CORS", "*").split(",")]

app = FastAPI(
    title="ComfyUI Workflow Studio API",
    version="1.0.0",
    description="Optional workflow storage and AI/ComfyUI proxy for the Studio client.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@contextmanager
def db() -> Iterator[sqlite3.Connection]:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS workflows (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT '',
                payload TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
            """
        )
        connection.commit()
        yield connection
    finally:
        connection.close()


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "comfyui-workflow-studio",
        "version": "1.0.0",
        "time": int(time.time()),
        "database": str(DB_PATH),
    }


# ---------------------------------------------------------------------------
# Workflow storage
# ---------------------------------------------------------------------------


class WorkflowPayload(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=200)
    category: str = ""
    payload: dict[str, Any]


@app.get("/api/workflows")
def list_workflows() -> dict[str, Any]:
    with db() as connection:
        rows = connection.execute(
            "SELECT id, name, category, created_at, updated_at FROM workflows ORDER BY updated_at DESC"
        ).fetchall()
    return {"workflows": [dict(row) for row in rows]}


@app.get("/api/workflows/{workflow_id}")
def get_workflow(workflow_id: str) -> dict[str, Any]:
    with db() as connection:
        row = connection.execute("SELECT * FROM workflows WHERE id = ?", (workflow_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {
        "id": row["id"],
        "name": row["name"],
        "category": row["category"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "payload": json.loads(row["payload"]),
    }


@app.put("/api/workflows/{workflow_id}")
def save_workflow(workflow_id: str, body: WorkflowPayload) -> dict[str, Any]:
    if body.id != workflow_id:
        raise HTTPException(status_code=400, detail="Body id and path id must match")
    now = int(time.time() * 1000)
    serialized = json.dumps(body.payload, ensure_ascii=False)
    with db() as connection:
        existing = connection.execute(
            "SELECT created_at FROM workflows WHERE id = ?", (workflow_id,)
        ).fetchone()
        created_at = existing["created_at"] if existing else now
        connection.execute(
            """
            INSERT INTO workflows (id, name, category, payload, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                category = excluded.category,
                payload = excluded.payload,
                updated_at = excluded.updated_at
            """,
            (workflow_id, body.name, body.category, serialized, created_at, now),
        )
        connection.commit()
    return {"ok": True, "id": workflow_id, "updatedAt": now}


@app.delete("/api/workflows/{workflow_id}")
def delete_workflow(workflow_id: str) -> dict[str, Any]:
    with db() as connection:
        cursor = connection.execute("DELETE FROM workflows WHERE id = ?", (workflow_id,))
        connection.commit()
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# AI proxies
# ---------------------------------------------------------------------------


class ProxyPayload(BaseModel):
    baseUrl: str
    payload: dict[str, Any]


def validate_https_host(base_url: str, allowed_suffixes: list[str]) -> str:
    base = base_url.rstrip("/")
    parsed = urlparse(base)
    if parsed.scheme != "https":
        raise HTTPException(status_code=400, detail="Only https upstream URLs are allowed")
    host = (parsed.hostname or "").lower()
    if not any(host == suffix or host.endswith(f".{suffix}") for suffix in allowed_suffixes):
        raise HTTPException(status_code=400, detail=f"Upstream host {host!r} is not allowlisted")
    return base


async def post_json(url: str, api_key: str, payload: dict[str, Any]) -> dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(url, headers=headers, json=payload)
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail=f"Upstream request failed: {error}") from error
    try:
        data = response.json()
    except ValueError:
        data = {"raw": response.text[:1000]}
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=data)
    return data


@app.post("/api/ai/agnes")
async def proxy_agnes(body: ProxyPayload, x_api_key: str = Header(default="")) -> dict[str, Any]:
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing x-api-key header")
    base = validate_https_host(body.baseUrl, ["agnes-ai.com"])
    return await post_json(f"{base}/images/generations", x_api_key, body.payload)


@app.post("/api/ai/agnes/check")
def check_agnes(x_api_key: str = Header(default="")) -> dict[str, Any]:
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing x-api-key header")
    return {
        "ok": True,
        "message": "Proxy reachable. The key itself is validated on the first real generation.",
    }


@app.post("/api/ai/deepseek")
async def proxy_deepseek(body: ProxyPayload, x_api_key: str = Header(default="")) -> dict[str, Any]:
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing x-api-key header")
    base = validate_https_host(body.baseUrl, ["deepseek.com"])
    return await post_json(f"{base}/chat/completions", x_api_key, body.payload)


# ---------------------------------------------------------------------------
# ComfyUI health helper
# ---------------------------------------------------------------------------


class ComfyBase(BaseModel):
    baseUrl: str


@app.post("/api/comfy/health")
async def comfy_health(body: ComfyBase) -> dict[str, Any]:
    base = body.baseUrl.rstrip("/")
    if urlparse(base).scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Invalid ComfyUI URL")
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(f"{base}/system_stats")
    except httpx.HTTPError as error:
        return {"ok": False, "error": str(error)}
    return {"ok": response.status_code < 400, "status": response.status_code}
