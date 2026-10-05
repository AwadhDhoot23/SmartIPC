# SmartIPC — Project Report Skeleton

## Abstract

SmartIPC is a workload-aware user-space framework for selecting an inter-process communication mechanism according to observed communication characteristics. The prototype benchmarks Pipes, POSIX Shared Memory, System V Message Queues, and Unix Domain Sockets under controlled workloads and records latency, throughput, CPU utilization, and peak resident memory. A multi-objective decision engine uses nearby measured profiles to recommend the mechanism that best matches the current workload. The work is intended as an operating-systems research prototype and emphasizes reproducible measurement rather than unsupported claims about kernel-level dynamic IPC replacement.

## Problem Statement

Applications often choose an IPC primitive statically even though communication characteristics vary by workload. A mechanism that is strong for small, infrequent messages may not be optimal for large, high-frequency payloads. SmartIPC investigates whether workload-aware selection can improve performance relative to a fixed IPC choice.

## Objectives

- Implement representative Unix IPC mechanisms.
- Build a common benchmarking harness.
- Measure latency, throughput, CPU, and memory.
- Create a workload profile database.
- Develop a transparent adaptive selection algorithm.
- Visualize and compare results.

## Methodology

Each workload is defined by payload size, number of logical messages, warmup iterations, requested message rate, and process count. A parent/child ping-pong protocol is used so that every benchmark measures actual communication rather than merely process startup. Several timed round trips are performed after warmup. The same logical payload semantics are used across all four mechanisms.

## Performance Metrics

### Average latency

Mean elapsed time of a complete parent → child → parent round trip per logical message.

### Percentile latency

p50 and p95 are calculated from the timed per-message samples.

### Throughput

Effective one-way application payload throughput:

`payload_bytes × timed_messages / elapsed_seconds`

### CPU utilization

The project reports CPU time consumed by the benchmark's parent and terminated child, normalized by wall-clock duration.

### Peak memory

Peak resident set size is collected using Linux `getrusage`.

## Adaptive Algorithm

For each IPC mechanism, nearby historical measurements are used to estimate expected performance for the current workload. Features are normalized using log-scaled message size/rate and bounded load/process values. A multi-objective score is computed by normalizing throughput positively and latency/CPU/memory negatively within the candidate group.

`score = 0.40*T + 0.30*L + 0.20*C + 0.10*M`

Repeated trials of the same workload/IPC combination are averaged first. The mechanism with the highest weighted score is then recommended, and the UI exposes the nearby measured evidence used for the decision.

## Experimental Questions

1. Which IPC mechanism provides the lowest latency for small payloads?
2. Which mechanism provides the highest throughput as payload size increases?
3. How does message frequency alter CPU cost?
4. Does workload-aware selection outperform a fixed IPC baseline?

## Limitations

- The prototype operates in user space.
- Results are machine-dependent.
- Scheduling noise and background load affect measurements.
- The decision engine relies on profiles collected under representative workloads.
- It is not a transparent kernel-level IPC replacement layer.

## Future Work

- Online model updating and confidence intervals.
- More process topologies (many-to-one, one-to-many, many-to-many).
- CPU pinning and real-time scheduling controls for tighter experiments.
- Kernel tracing with eBPF/perf.
- Learned cost models once sufficient profile data exists.
