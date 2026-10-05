#!/usr/bin/env python3
from __future__ import annotations

import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.storage import all_results  # noqa: E402

OUT = ROOT / "data" / "benchmark_export.csv"

rows = all_results()
if not rows:
    print("No benchmark observations found. Run scripts/profile.py first.")
    raise SystemExit(0)

with OUT.open("w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)

print(f"Exported {len(rows)} observations to {OUT}")
