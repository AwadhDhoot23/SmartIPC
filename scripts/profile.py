#!/usr/bin/env python3
"""Collect reproducible SmartIPC benchmark profiles into the project's SQLite DB."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_DIR = ROOT / "data"
DB_DIR.mkdir(exist_ok=True)
sys.path.insert(0, str(ROOT / "backend"))

from app.config import BENCHMARK_PATH  # noqa: E402
from app.storage import init_db, insert_result  # noqa: E402

IPC_METHODS = ["pipe", "shared_memory", "message_queue", "unix_socket"]


def parse_csv_ints(text: str) -> list[int]:
    values = []
    for item in text.split(","):
        item = item.strip()
        if not item:
            continue
        value = int(item)
        if value <= 0:
            raise ValueError("sizes/messages must be positive")
        values.append(value)
    if not values:
        raise ValueError("empty numeric list")
    return values


def parse_csv_rates(text: str) -> list[float]:
    values = [float(x.strip()) for x in text.split(",") if x.strip()]
    if not values or any(x < 0 for x in values):
        raise ValueError("rates must contain non-negative values")
    return values


def run(ipc: str, bytes_: int, messages: int, warmup: int, rate: float) -> dict:
    cp = subprocess.run(
        [
            str(BENCHMARK_PATH), "--ipc", ipc, "--bytes", str(bytes_),
            "--messages", str(messages), "--warmup", str(warmup), "--rate", str(rate)
        ], capture_output=True, text=True, timeout=180, check=False,
    )
    if cp.returncode != 0:
        raise RuntimeError(f"{ipc} failed: {cp.stderr.strip()}")
    return json.loads(cp.stdout.strip().splitlines()[-1])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--quick", action="store_true", help="small 3-size profile for first setup")
    parser.add_argument("--sizes", default="64,1024,4096,16384")
    parser.add_argument("--rates", default="0,1000,5000")
    parser.add_argument("--messages", type=int, default=1000)
    parser.add_argument("--warmup", type=int, default=100)
    parser.add_argument("--repetitions", type=int, default=5, help="independent trials per workload/IPC")
    args = parser.parse_args()

    if not BENCHMARK_PATH.exists():
        raise SystemExit(f"Benchmark binary not found: {BENCHMARK_PATH}. Run `cd cpp && make` first.")

    if args.quick:
        sizes = [64, 1024, 4096]
        rates = [0.0, 2000.0]
        messages = 400
        warmup = 50
        repetitions = max(2, min(args.repetitions, 3))
    else:
        sizes = parse_csv_ints(args.sizes)
        rates = parse_csv_rates(args.rates)
        messages = args.messages
        warmup = args.warmup
        repetitions = args.repetitions

    if repetitions < 1:
        raise ValueError("repetitions must be >= 1")

    init_db()
    total = len(IPC_METHODS) * len(sizes) * len(rates) * repetitions
    done = 0
    print(f"Collecting {total} profiles...\n")
    for size in sizes:
        for rate in rates:
            for ipc in IPC_METHODS:
                for rep in range(1, repetitions + 1):
                    result = run(ipc, size, messages, warmup, rate)
                    record_id = insert_result(result)
                    done += 1
                    print(
                        f"[{done:>3}/{total}] {ipc:14s} size={size:<7d} rate={rate:<7g} "
                        f"rep={rep}/{repetitions} lat={result['avg_latency_us']:.2f}us "
                        f"thr={result['throughput_mbps']:.2f}MB/s id={record_id}"
                    )
    print("\nProfile collection complete. Open the dashboard and request a recommendation.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
