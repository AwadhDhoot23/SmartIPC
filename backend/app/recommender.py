from __future__ import annotations

import math
from collections import defaultdict
from typing import Any

IPC_METHODS = ["pipe", "shared_memory", "message_queue", "unix_socket"]
IPC_LABELS = {"pipe": "Pipe", "shared_memory": "Shared Memory", "message_queue": "Message Queue", "unix_socket": "Unix Socket"}
METRIC_LABELS = {"throughput_mbps": "throughput", "avg_latency_us": "average latency", "p95_latency_us": "P95 latency", "cpu_percent": "CPU usage", "peak_rss_mb": "memory footprint"}
NOISE_FLOOR = 0.05  # relative spread below which a metric cannot separate mechanisms
METRIC_UNITS = {"throughput_mbps": " MiB/s", "avg_latency_us": " µs", "p95_latency_us": " µs", "cpu_percent": "%", "peak_rss_mb": " MB"}

# Weights for max-rate mode (rate=0)
THROUGHPUT_WEIGHTS = {
    "throughput_mbps": 0.40,
    "avg_latency_us": 0.30,
    "cpu_percent": 0.20,
    "peak_rss_mb": 0.10,
}

# Weights for paced mode (rate>0)
RATE_LIMITED_WEIGHTS = {
    "avg_latency_us": 0.45,
    "p95_latency_us": 0.30,
    "cpu_percent": 0.15,
    "peak_rss_mb": 0.10,
}


def _weights_for_rate(rate: float) -> dict[str, float]:
    return dict(RATE_LIMITED_WEIGHTS if rate > 0 else THROUGHPUT_WEIGHTS)


def _feature_vector(row: dict[str, Any]) -> tuple[float, float, float, float]:
    return (
        math.log1p(max(0.0, float(row["bytes"]))),
        math.log1p(max(0.0, float(row["requested_rate"]))),
        float(row.get("processes", 2)),
        min(16.0, max(0.0, float(row.get("load_1m", 0.0)))),
    )


def _distance(a: tuple[float, ...], b: tuple[float, ...]) -> float:
    scales = (1.0, 1.0, 2.0, 1.5)
    return math.sqrt(sum(((x - y) / s) ** 2 for x, y, s in zip(a, b, scales)))


def _workload_key(row: dict[str, Any]) -> tuple[int, float, int]:
    return (int(row["bytes"]), float(row["requested_rate"]), int(row.get("processes", 2)))


def _fallback(bytes_: int, rate: float) -> tuple[str, str]:
    if rate > 0:
        return "unix_socket", "Fallback: Unix Socket provides robust kernel flow-control for rate-limited traffic."
    if bytes_ < 512:
        return "pipe", "Fallback: Pipe has minimal syscall overhead for tiny payloads."
    if bytes_ >= 4096:
        return "shared_memory", "Fallback: Shared Memory zero-copy semantics dominate for large payloads."
    return "pipe", "Fallback: Pipe is a safe default for moderate traffic."


def _aggregate_replicates(rows: list[dict[str, Any]], weights: dict[str, float]) -> list[dict[str, Any]]:
    groups: dict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        key = (row.get("ipc"), int(row.get("bytes", 0)), float(row.get("requested_rate", 0.0)), int(row.get("processes", 2)))
        groups[key].append(row)

    aggregated: list[dict[str, Any]] = []
    for key, items in groups.items():
        base = dict(items[0])
        all_metrics = set(THROUGHPUT_WEIGHTS) | set(RATE_LIMITED_WEIGHTS)
        for metric in all_metrics:
            vals = [float(x[metric]) for x in items if metric in x]
            if vals:
                base[metric] = sum(vals) / len(vals)
        base["load_1m"] = sum(float(x.get("load_1m", 0.0)) for x in items) / len(items)
        base["replicates"] = len(items)
        base["source_ids"] = [x.get("id") for x in items if x.get("id") is not None]
        aggregated.append(base)
    return aggregated


def recommend(rows: list[dict[str, Any]], *, bytes_: int, rate: float, processes: int = 2, load_1m: float = 0.0) -> dict[str, Any]:
    active_weights = _weights_for_rate(rate)
    target = (math.log1p(bytes_), math.log1p(rate), float(processes), float(load_1m))

    if not rows:
        method, explanation = _fallback(bytes_, rate)
        return {"recommended_ipc": method, "confidence": 0.35, "mode": "fallback", "dominant_metric": None, "explanation": explanation, "evidence": [], "weights": active_weights}

    # Paced and max-rate runs measure different things (paced throughput is
    # capped by the requested rate), so only match within the same regime.
    paced = rate > 0
    regime_rows = [
        r for r in rows
        if r.get("ipc") in IPC_METHODS and (float(r.get("requested_rate", 0.0)) > 0) == paced
    ]
    profile_rows = _aggregate_replicates(regime_rows, active_weights)
    profiles_by_ipc: dict[str, dict[tuple[int, float, int], dict[str, Any]]] = defaultdict(dict)
    for row in profile_rows:
        profiles_by_ipc[row["ipc"]][_workload_key(row)] = row

    # Workloads measured for every profiled mechanism. Interpolating over these
    # compares like with like; otherwise a mechanism with an extra far-away
    # profile (e.g. a 64 KB run) gets an estimate the others cannot match.
    shared_keys = set.intersection(*(set(p) for p in profiles_by_ipc.values())) if profiles_by_ipc else set()
    exact_key = (int(bytes_), float(rate), int(processes))

    estimated: dict[str, dict[str, float]] = {}
    evidence: dict[str, list[dict[str, Any]]] = {}
    match_basis: dict[str, str] = {}
    all_metrics = set(THROUGHPUT_WEIGHTS) | set(RATE_LIMITED_WEIGHTS)

    for ipc in IPC_METHODS:
        profiles = profiles_by_ipc.get(ipc)
        if not profiles:
            continue
        if exact_key in profiles:
            samples = [(0.0, profiles[exact_key])]
            match_basis[ipc] = "exact"
        else:
            keys = shared_keys or set(profiles)
            match_basis[ipc] = "shared" if shared_keys else "own"
            samples = sorted(
                ((_distance(target, _feature_vector(profiles[k])), profiles[k]) for k in keys),
                key=lambda x: x[0],
            )[:5]
        totals: dict[str, float] = {k: 0.0 for k in all_metrics}
        denom = 0.0
        evidence[ipc] = []
        for dist, row in samples:
            # Shepard inverse-distance weighting: nearer profiles dominate.
            w = 1.0 / max(dist, 1e-6) ** 2
            denom += w
            for key in all_metrics:
                if key in row: totals[key] += w * float(row[key])
            evidence[ipc].append({
                "ids": row.get("source_ids", []), "replicates": row.get("replicates", 1), "distance": round(dist, 4),
                "bytes": row["bytes"], "requested_rate": row["requested_rate"],
                "avg_latency_us": round(float(row.get("avg_latency_us", 0)), 6), "p95_latency_us": round(float(row.get("p95_latency_us", 0)), 6),
                "throughput_mbps": round(float(row.get("throughput_mbps", 0)), 6), "cpu_percent": round(float(row.get("cpu_percent", 0)), 6), "peak_rss_mb": round(float(row.get("peak_rss_mb", 0)), 6),
            })
        estimated[ipc] = {k: v / denom for k, v in totals.items()}

    if not estimated:
        method, explanation = _fallback(bytes_, rate)
        return {"recommended_ipc": method, "confidence": 0.35, "mode": "fallback", "dominant_metric": None, "explanation": explanation, "evidence": [], "weights": active_weights}

    metric_scores: dict[str, dict[str, float]] = {ipc: {} for ipc in estimated}
    for metric in active_weights:
        vals = [v[metric] for v in estimated.values()]
        lo, hi = min(vals), max(vals)
        span = hi - lo
        mean_val = sum(vals) / len(vals) if vals else 1.0
        relative_span = span / (abs(mean_val) + 1e-9)
        for ipc, metrics in estimated.items():
            # Spreads under NOISE_FLOOR are within run-to-run noise; treating
            # them as real would let e.g. a 16 KB RSS gap decide the winner.
            if span <= 1e-12 or relative_span < NOISE_FLOOR:
                score = 0.5
            elif metric == "throughput_mbps":
                score = (metrics[metric] - lo) / span
            else:
                score = (hi - metrics[metric]) / span
            metric_scores[ipc][metric] = score

    # The winner is decided purely by the measured, weighted scores. No
    # hand-tuned per-mechanism bonuses: if the data says otherwise, the data wins.
    final_scores: dict[str, float] = {
        ipc: sum(active_weights[m] * scores[m] for m in active_weights)
        for ipc, scores in metric_scores.items()
    }

    ranked = sorted(final_scores, key=lambda k: final_scores[k], reverse=True)
    winner = ranked[0]
    runner_up = ranked[1] if len(ranked) > 1 else None
    margin = final_scores[winner] - final_scores[runner_up] if runner_up else 1.0
    evidence_count = sum(len(v) for v in evidence.values())
    missing = [ipc for ipc in IPC_METHODS if ipc not in estimated]

    exact_profile = any(any(item.get("distance", 1.0) == 0.0 for item in entries) for entries in evidence.values())
    base_confidence = 0.80 if exact_profile else 0.65
    confidence = min(0.95, base_confidence + min(0.20, max(0.0, margin)) + min(0.15, 0.03 * min(evidence_count, 5)))
    # A winner picked without profiles for every mechanism is a weaker claim.
    confidence *= len(estimated) / len(IPC_METHODS)

    winner_scores = metric_scores[winner]
    if runner_up:
        # The metric that contributed most to beating the runner-up.
        runner_scores = metric_scores[runner_up]
        dominant_metric = max(active_weights, key=lambda m: active_weights[m] * (winner_scores[m] - runner_scores[m]))
    else:
        dominant_metric = max(active_weights, key=lambda m: active_weights[m] * winner_scores.get(m, 0.0))
    dominant_label = METRIC_LABELS.get(dominant_metric, dominant_metric)
    score_desc = "45/30/15/10 (paced mode)" if rate > 0 else "40/30/20/10 (max-rate mode)"

    if runner_up:
        unit = METRIC_UNITS.get(dominant_metric, "")
        comparison = (
            f"It beat runner-up {IPC_LABELS[runner_up]} mainly on {dominant_label}: "
            f"{estimated[winner][dominant_metric]:.2f}{unit} vs {estimated[runner_up][dominant_metric]:.2f}{unit}."
        )
    else:
        comparison = f"{IPC_LABELS[winner]} is the only mechanism with profiles."
    if all(basis == "exact" for basis in match_basis.values()):
        comparison += " All values measured at exactly this workload."
    else:
        comparison += " Some values are interpolated from the nearest workloads measured for every mechanism." if shared_keys \
            else " Mechanisms share no common workload, so values are interpolated from each one's own profiles."
    if missing:
        comparison += f" Not yet profiled{' in paced mode' if paced else ''}: {', '.join(IPC_LABELS[m] for m in missing)}."

    return {
        "recommended_ipc": winner,
        "confidence": round(confidence, 4),
        "mode": "profile_based",
        "dominant_metric": dominant_metric,
        "explanation": f"Decision driven by {dominant_label}. Scored using {score_desc}. {comparison}",
        "estimated_metrics": estimated,
        "final_scores": {k: round(v, 4) for k, v in final_scores.items()},
        "metric_scores": metric_scores,
        "evidence": evidence,
        "match_basis": match_basis,
        "weights": active_weights,
    }
