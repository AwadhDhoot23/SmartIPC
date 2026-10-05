from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from .config import DB_PATH


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = connect()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS benchmarks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                ipc TEXT NOT NULL,
                bytes INTEGER NOT NULL,
                messages INTEGER NOT NULL,
                warmup INTEGER NOT NULL,
                requested_rate REAL NOT NULL,
                processes INTEGER NOT NULL,
                elapsed_ms REAL NOT NULL,
                avg_latency_us REAL NOT NULL,
                p50_latency_us REAL NOT NULL,
                p95_latency_us REAL NOT NULL,
                max_latency_us REAL NOT NULL,
                throughput_mbps REAL NOT NULL,
                cpu_percent REAL NOT NULL,
                peak_rss_mb REAL NOT NULL,
                load_1m REAL NOT NULL,
                page_size INTEGER NOT NULL
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_bench_ipc ON benchmarks(ipc)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_bench_workload ON benchmarks(bytes, requested_rate, processes)")
        conn.commit()
    finally:
        conn.close()


def insert_result(result: dict[str, Any]) -> int:
    fields = [
        "ipc", "bytes", "messages", "warmup", "requested_rate", "processes",
        "elapsed_ms", "avg_latency_us", "p50_latency_us", "p95_latency_us",
        "max_latency_us", "throughput_mbps", "cpu_percent", "peak_rss_mb",
        "load_1m", "page_size"
    ]
    values = [result[f] for f in fields]
    conn = connect()
    try:
        cur = conn.execute(
            f"INSERT INTO benchmarks ({','.join(fields)}) VALUES ({','.join('?' for _ in fields)})",
            values,
        )
        conn.commit()
        return int(cur.lastrowid)
    finally:
        conn.close()


def list_results(limit: int = 100) -> list[dict[str, Any]]:
    conn = connect()
    try:
        rows = conn.execute(
            "SELECT * FROM benchmarks ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def all_results() -> list[dict[str, Any]]:
    conn = connect()
    try:
        rows = conn.execute("SELECT * FROM benchmarks ORDER BY id ASC").fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()
