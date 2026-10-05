# SmartIPC Detailed Design

## 1. Benchmark protocol

All mechanisms use a two-process ping-pong protocol:

```text
Parent                         Child
  |                              |
  | ----- logical payload -----> |
  |                              |
  | <----- echoed payload ------ |
  |                              |
```

One logical message is one complete parent→child→parent round trip. Warmup messages are executed first and excluded from timing statistics.

## 2. Pipe implementation

Two anonymous pipes are created:

- request pipe: parent writes, child reads
- response pipe: child writes, parent reads

Payloads are framed using a 32-bit length header so the stream can be read safely even when the kernel splits writes into multiple chunks.

## 3. Shared-memory implementation

The parent creates a POSIX shared-memory object and maps it into both processes. The region contains:

- metadata header
- request payload buffer
- response payload buffer

Two POSIX named semaphores provide blocking synchronization. Shared memory therefore demonstrates both the data-sharing primitive and the synchronization requirement that normally accompanies it.

## 4. Message-queue implementation

System V queues are created privately for the benchmark. A logical payload may exceed a platform's single-message limit, so SmartIPC splits larger payloads into numbered frames. The parent uses one queue for requests and the child uses the other for responses.

## 5. Unix-domain socket implementation

A Unix `socketpair(AF_UNIX, SOCK_STREAM, ...)` provides a local full-duplex stream. Framing uses the same 32-bit length prefix as the pipe implementation.

## 6. Measurement methodology

The benchmark measures each timed round trip with `std::chrono::steady_clock`. The result reports average, p50, p95, and maximum latency. Wall-clock time and payload volume are used to calculate effective throughput.

CPU consumption is derived from Linux `getrusage` for the parent and terminated child. Because parent and child can execute on different logical CPUs, aggregate CPU can exceed 100%; this is intentional and is labeled accordingly in the dashboard.

Peak RSS is collected from `getrusage` as a process-level memory indicator.

## 7. Adaptive decision engine

The decision engine stores every successful benchmark as an observation. For a new workload, it builds a feature vector:

```text
(log1p(payload bytes), log1p(requested rate), process count, load-1m)
```

For each IPC mechanism, up to five nearest local observations are selected. Inverse-distance weighting estimates its expected metrics at the new workload.

A metric normalization then converts the estimates into 0–1 scores. Throughput is maximized; latency, CPU and RSS are minimized.

```text
Final Score =
    0.40 × Throughput
  + 0.30 × Latency score
  + 0.20 × CPU score
  + 0.10 × Memory score
```

This is intentionally transparent. Every recommendation can be explained by the UI's evidence rows.

## 8. Why this is adaptive

A fixed policy might always select shared memory. SmartIPC instead recomputes the candidate ranking from workload-relevant measured profiles. Therefore different payload/rate regions can produce different recommendations.

## 9. Extension path

The current version uses nearest measured profiles. A future research extension can replace or augment this layer with regression, classification, online bandits, confidence intervals, or kernel/eBPF telemetry without changing the IPC benchmark layer.
