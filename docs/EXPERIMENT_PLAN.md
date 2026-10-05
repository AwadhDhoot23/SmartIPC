# SmartIPC Experiment Plan

## Baseline IPC methods

1. Pipe
2. POSIX Shared Memory
3. System V Message Queue
4. Unix Domain Socket

## Suggested workloads

| Class | Payload | Rate | Messages | Goal |
|---|---:|---:|---:|---|
| Small/low | 64 B | 100 | 1000 | control traffic |
| Small/high | 64 B | 5000 | 2000 | high-frequency messages |
| Medium | 1 KB | 1000 | 2000 | balanced workload |
| Large | 16 KB | 1000 | 1000 | bulk transfer |
| Large/high | 64 KB | 0 | 1000 | maximum throughput |

`rate=0` means benchmark as fast as possible.

## Fairness rules

- Same message sizes, message counts, and warmup for every IPC mechanism.
- Same parent/child protocol semantics.
- Run at least 5 repetitions for report-quality numbers.
- Discard warmup samples.
- Report median/p95, not just average.
- Run on an otherwise idle machine where practical.
- Record CPU model, RAM, OS/kernel version, and GCC version in the report.

## Evaluation

For each workload, compare:

- Pipe
- Shared Memory
- Message Queue
- Unix Socket
- SmartIPC recommendation

Then compute:

`Improvement = (baseline_metric - SmartIPC_metric) / baseline_metric × 100`

For metrics where higher is better (throughput), reverse the numerator appropriately.


## Measurement revision (October 2026)

CPU utilization is measured only across the timed benchmark interval. The parent and child process CPU deltas are captured separately from setup/warmup; the reported value is their aggregate CPU time divided by benchmark wall time and may exceed 100% on a multicore system.

Each workload/IPC combination should be repeated multiple times (recommended: 5 or more) before comparing mechanisms. The profiling script supports `--repetitions` and stores every trial in SQLite so the dashboard/recommender can work from locally observed evidence.
