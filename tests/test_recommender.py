import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.recommender import recommend


def row(ipc, bytes_, rate, lat, thr, cpu, rss, load=0.1):
    return {
        "id": 1,
        "ipc": ipc,
        "bytes": bytes_,
        "requested_rate": rate,
        "processes": 2,
        "load_1m": load,
        "avg_latency_us": lat,
        "throughput_mbps": thr,
        "cpu_percent": cpu,
        "peak_rss_mb": rss,
    }


def test_recommendation_prefers_high_throughput_for_bulk_workload():
    rows = [
        row("pipe", 65536, 0, 40, 80, 60, 2),
        row("shared_memory", 65536, 0, 8, 300, 35, 8),
        row("message_queue", 65536, 0, 60, 40, 80, 3),
        row("unix_socket", 65536, 0, 25, 120, 55, 2),
    ]
    result = recommend(rows, bytes_=65536, rate=0, processes=2, load_1m=0.1)
    assert result["recommended_ipc"] == "shared_memory"
    assert result["mode"] == "profile_based"


def test_fallback_exists_without_profiles():
    result = recommend([], bytes_=64, rate=10, processes=2, load_1m=0.1)
    assert result["recommended_ipc"] in {"pipe", "shared_memory", "unix_socket"}
    assert result["mode"] == "fallback"


def test_recommendation_averages_replicates_before_matching():
    rows = []
    for trial in range(5):
        rows.extend([
            row("pipe", 1024, 0, 30 + trial, 50 - trial, 50, 2),
            row("shared_memory", 1024, 0, 10 + trial, 100 + trial, 40, 4),
            row("message_queue", 1024, 0, 45 + trial, 40, 70, 3),
            row("unix_socket", 1024, 0, 20 + trial, 80, 45, 2),
        ])
    result = recommend(rows, bytes_=1024, rate=0, processes=2, load_1m=0.1)
    assert result["recommended_ipc"] == "shared_memory"
    assert all(item["replicates"] == 5 for items in result["evidence"].values() for item in items)
