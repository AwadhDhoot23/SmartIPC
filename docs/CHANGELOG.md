# SmartIPC Changelog

## 1.1.0 — Measurement and profiling revision

- Fixed CPU measurement so parent and child CPU deltas are captured only for the timed benchmark interval.
- Added explicit `cpu_scope` metadata to benchmark JSON output.
- Kept CPU as aggregate parent+child utilization; values above 100% are valid on a multicore system.
- Added repeated-trial support to `scripts/profile.py` with `--repetitions`.
- SmartIPC recommendation now averages replicate trials for the same workload/IPC before nearest-profile matching.
- Updated dashboard wording to distinguish CPU utilization from CPU time.
- Added WSL2/Ubuntu setup documentation and environment checker.
- Removed the stale `/api/profile/quick` README reference.
