from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any

from .config import BENCHMARK_PATH
from .models import BenchmarkRequest, IPCName

ALLOWED: tuple[IPCName, ...] = ("pipe", "shared_memory", "message_queue", "unix_socket")


def validate_binary() -> None:
    if not BENCHMARK_PATH.exists():
        raise RuntimeError(
            f"Benchmark binary not found at {BENCHMARK_PATH}. Build it with: cd cpp && make"
        )
    if not os.access(BENCHMARK_PATH, os.X_OK):
        raise RuntimeError(f"Benchmark binary is not executable: {BENCHMARK_PATH}")


def run_one(req: BenchmarkRequest) -> dict[str, Any]:
    validate_binary()
    args = [
        str(BENCHMARK_PATH),
        "--ipc", req.ipc,
        "--bytes", str(req.bytes),
        "--messages", str(req.messages),
        "--warmup", str(req.warmup),
        "--rate", str(req.rate),
    ]
    try:
        completed = subprocess.run(
            args,
            capture_output=True,
            text=True,
            check=False,
            timeout=180,
            env={**os.environ, "LC_ALL": "C"},
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("Benchmark timed out. Reduce message count/payload size.") from exc

    if completed.returncode != 0:
        detail = completed.stderr.strip() or "unknown benchmark error"
        raise RuntimeError(detail)

    line = completed.stdout.strip().splitlines()[-1] if completed.stdout.strip() else ""
    try:
        result = json.loads(line)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Benchmark returned invalid JSON: {line[:500]}") from exc

    if result.get("ipc") not in ALLOWED:
        raise RuntimeError("Benchmark returned an unknown IPC mechanism")
    return result
