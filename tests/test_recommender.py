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


def test_paced_workload_follows_measurements_not_fixed_bonus():
    # Shared memory is measured best on every paced-mode metric, so it must win.
    rows = [
        {**row("shared_memory", 1024, 500, 5, 0.5, 10, 2), "p95_latency_us": 8},
        {**row("pipe", 1024, 500, 50, 0.5, 60, 2), "p95_latency_us": 80},
        {**row("message_queue", 1024, 500, 60, 0.5, 70, 2), "p95_latency_us": 90},
        {**row("unix_socket", 1024, 500, 50, 0.5, 60, 2), "p95_latency_us": 80},
    ]
    result = recommend(rows, bytes_=1024, rate=500, processes=2, load_1m=0.1)
    assert result["recommended_ipc"] == "shared_memory"


def test_large_payload_follows_measurements_not_fixed_bonus():
    # Pipe is measured best at 64 KB, so it must win.
    rows = [
        row("pipe", 65536, 0, 5, 900, 10, 2),
        row("shared_memory", 65536, 0, 9, 500, 30, 2),
        row("message_queue", 65536, 0, 60, 50, 70, 2),
        row("unix_socket", 65536, 0, 50, 100, 60, 2),
    ]
    result = recommend(rows, bytes_=65536, rate=0, processes=2, load_1m=0.1)
    assert result["recommended_ipc"] == "pipe"


def test_partial_profiles_do_not_crash_and_lower_confidence():
    rows = [row("pipe", 64, 0, 5, 10, 10, 2), row("unix_socket", 64, 0, 9, 6, 20, 2)]
    partial = recommend(rows, bytes_=64, rate=0, processes=2, load_1m=0.1)
    assert partial["recommended_ipc"] == "pipe"
    assert "Not yet profiled" in partial["explanation"]

    single = recommend(rows[:1], bytes_=64, rate=0, processes=2, load_1m=0.1)
    assert single["recommended_ipc"] == "pipe"
    assert single["confidence"] < partial["confidence"]


def test_extra_far_profile_does_not_inflate_one_mechanism():
    # Only shared memory has a 64 KB profile; it must not leak into a 1 KB estimate.
    rows = [
        row("pipe", 1024, 0, 15, 63, 80, 2),
        row("shared_memory", 1024, 0, 29, 33, 35, 2),
        row("shared_memory", 65536, 0, 16, 3900, 35, 2),
        row("message_queue", 1024, 0, 41, 27, 80, 2),
        row("unix_socket", 1024, 0, 14, 67, 90, 2),
    ]
    exact = recommend(rows, bytes_=1024, rate=0, processes=2, load_1m=0.1)
    assert exact["estimated_metrics"]["shared_memory"]["throughput_mbps"] == 33
    assert exact["recommended_ipc"] != "shared_memory"

    # 2 KB has no exact profile: interpolate over the 1 KB workload all four share.
    near = recommend(rows, bytes_=2048, rate=0, processes=2, load_1m=0.1)
    assert near["estimated_metrics"]["shared_memory"]["throughput_mbps"] == 33
    assert near["match_basis"]["shared_memory"] == "shared"


def test_paced_query_ignores_max_rate_profiles():
    rows = [row(ipc, 1024, 0, 10, 50, 50, 2) for ipc in ("pipe", "shared_memory", "message_queue", "unix_socket")]
    result = recommend(rows, bytes_=1024, rate=500, processes=2, load_1m=0.1)
    assert result["mode"] == "fallback"
