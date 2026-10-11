# SmartIPC — Project Explanation for Faculty

**Course:** Operating Systems  
**Team:** Awadh Dhoot · Aryavardhan Sharma  
**Institution:** VIT  

---

## What Is SmartIPC?

When two programs on the same computer need to share data, the operating system provides several methods called **Inter-Process Communication (IPC)** mechanisms. The problem is: which one should a developer pick?

Textbooks give general rules (e.g. "Shared Memory is fast for large data"), but those rules don't reflect actual performance on a specific machine. SmartIPC solves this by:

1. **Measuring** all four IPC mechanisms on the actual machine
2. **Learning** from those measurements
3. **Recommending** the best IPC for any given workload — based on real data, not theory

---

## The Four IPC Mechanisms We Benchmark

### Pipe
Data flows through a small buffer the OS manages in kernel memory. Process A writes in; Process B reads out. Simple, low-overhead — but every message is copied twice (into the buffer, then out).

**Best for:** Tiny messages where simplicity matters.

### Shared Memory
Both processes map the same physical RAM. Writing to it is just a regular memory write — no kernel involvement per message, **zero copies**. But it needs semaphores for synchronisation.

**Best for:** Large payloads where avoiding copies saves significant time.

### Message Queue
The OS maintains a queue of discrete, typed messages. Sender puts messages in; receiver picks them up. Messages have structure and type tags.

**Best for:** Structured, decoupled communication between producer and consumer.

### Unix Socket
A two-way channel using the same socket API as network programming, but staying local (no network). The kernel's flow-control mechanisms work naturally here.

**Best for:** Rate-limited (paced) workloads that need stable latency.

---

## How SmartIPC Works — The Three Layers

### Layer 1: C++ Benchmark Engine
A C++17 program that runs the actual IPC tests. It:
- Uses `fork()` to create two processes (parent and child)
- Sends N messages of a given size through one IPC mechanism
- Measures: latency (per message), throughput (MB/s), CPU usage, and memory usage
- Captures precise timings using POSIX `clock_gettime()` and `getrusage()`
- Outputs all measurements as JSON

This is the foundation — without real measurements, the recommendation is just a guess.

### Layer 2: Python API Server (FastAPI)
A web server that:
- Receives benchmark requests from the dashboard
- Runs the C++ binary and collects its JSON output
- Stores every result in a local SQLite database (persistent history)
- Runs the **recommendation algorithm** (WAISA) when asked
- Exposes a REST API at `http://localhost:8000`

### Layer 3: React Web Dashboard
A browser-based UI that:
- Lets you set workload parameters (payload size, message count, target send rate)
- Triggers benchmarks and shows live bar charts
- Requests and displays IPC recommendations with confidence scores
- Shows a history table of all past benchmark runs
- Features animated WebGL backgrounds built with Three.js/OGL

---

## The Core Algorithm: WAISA

**Workload-Aware Adaptive IPC Selection Algorithm**

This is the intellectual core of the project. The algorithm answers: *"Given a new workload (bytes + rate), what does the stored benchmark data tell us is the best IPC?"*

### The Problem It Solves
We can't benchmark every possible combination (bytes can be 1–16,000,000; rate can be 0–1,000,000). So when a user asks about 3000-byte messages at 750 msg/s — a combination never measured — the algorithm must **interpolate** intelligently from nearby measurements.

### Step-by-Step

**Step 1 — Separate by regime**  
Paced runs (rate > 0) and max-rate runs (rate = 0) are kept separate. Paced throughput is artificially capped, so comparing it to max-rate throughput would be misleading.

**Step 2 — Encode the workload as a point in space**  
The target `(bytes, rate, processes, system_load)` is converted into a 4-D coordinate using `log(1 + x)` scaling. Log scaling makes the distances fair — 64 bytes vs 128 bytes should feel similar to 32 KB vs 64 KB (a doubling in both cases).

**Step 3 — Average repeated trials**  
If the same workload was run 5 times, those 5 results are averaged into one representative point. This removes repetition bias.

**Step 4 — Find fair comparison points**  
Only workload sizes that **all four** IPC mechanisms have been measured at are used for interpolation. This ensures a fair, like-for-like comparison.

**Step 5 — Inverse-distance interpolation (Shepard's Method)**  
For each IPC, find the 5 nearest stored profiles. Estimate their metrics using:
```
weight = 1 / distance²
estimated_metric = Σ(weight × metric) / Σ(weight)
```
Profiles 2× farther away get 4× less influence. This is the "smart" part — the system predicts performance at unmeasured workloads.

**Step 6 — Noise filter**  
If the difference between mechanisms on a metric is less than 5% of the average value, it's within measurement noise. All mechanisms score equally on that metric — noise never picks the winner.

**Step 7 — Weighted scoring**  
Each mechanism scores 0–1 on each metric (1 = best). These are combined with weights that change based on the workload:

| Mode | What matters most |
|---|---|
| Max-rate (`rate=0`) | Throughput 40%, Avg Latency 30%, CPU 20%, Memory 10% |
| Paced (`rate>0`) | Avg Latency 45%, P95 Latency 30%, CPU 15%, Memory 10% |

The paced mode prioritises **latency stability** over raw speed because the throughput is already capped.

**Step 8 — Confidence score**  
Tells the user how much to trust the result:
- Higher when an exact workload match exists in the database
- Higher when the winner beats the runner-up by a large margin
- Lower when some IPC mechanisms haven't been profiled yet

**Step 9 — Human-readable explanation**  
The API response explains *why* it chose the winner, naming the dominant metric, the runner-up, and the actual numbers (e.g. "average latency: 12 µs vs 38 µs").

---

## What Makes This "Smart"

Three properties make SmartIPC more than just a benchmark runner:

### 1. Adaptive — data over theory
Unlike textbook rules, SmartIPC measures on *your* machine. A cloud VM, a Raspberry Pi, and a desktop behave very differently. The recommendation adapts to the actual hardware.

### 2. Predictive — interpolates unseen workloads
The Shepard inverse-distance weighting allows the system to give confident recommendations for payload sizes and rates it has never measured directly. You seed the database once, then ask questions indefinitely.

### 3. Honest — calibrated confidence
The system tells you how sure it is. A recommendation backed by 5 exact measurements at that exact workload gets a high confidence score. A recommendation backed by interpolation from distant profiles gets a lower score.

---

## Demo: Three Cases That Show the System Works

### Case 1 — Tiny payload → Pipe wins
**Set:** Payload = 64 bytes, Rate = 0  
**Click:** Compare → Recommend  
**Expected winner:** Pipe  
**Why:** For 64-byte messages, the overhead of mapping shared memory pages (TLB operations) costs more than the copy Pipe makes. Real measurement confirms this.

### Case 2 — Large payload → Shared Memory wins
**Set:** Payload = 65536 bytes (64 KB), Rate = 0  
**Click:** Compare → Recommend  
**Expected winner:** Shared Memory  
**Why:** At 64 KB, copying data through the kernel twice (as Pipe does) wastes significant time. Zero-copy Shared Memory dominates. The throughput chart will show a clear gap.

### Case 3 — Rate-limited → Unix Socket wins
**Set:** Payload = 1024 bytes, Rate = 500 msg/s  
**Click:** Compare → Recommend  
**Expected winner:** Unix Socket  
**Why:** When you cap the rate, raw throughput doesn't matter — latency stability does. The scoring model switches automatically from `40/30/20/10` to `45/30/15/10`. The dashboard's "Scoring model" card shows this switch live.

---

## Technology Choices

| Component | Technology | Reason |
|---|---|---|
| Benchmark | C++17, POSIX APIs | Lowest overhead; direct syscall access for precise timing |
| Backend | Python + FastAPI | Rapid API development; clean auto-generated docs |
| Algorithm | Pure Python (math, defaultdict) | Readable, testable, no ML dependency |
| Storage | SQLite | Zero-setup, file-based, perfect for local prototype |
| Frontend | React + Vite | Fast dev experience; component-based UI |
| Animations | Three.js / OGL | GPU-accelerated visual backgrounds |

---

## Project Outcomes

- **4 IPC mechanisms** benchmarked and compared on the same machine
- **WAISA algorithm** recommends the right IPC for any workload using data-driven interpolation
- **Dual-regime scoring** automatically adapts weights based on whether the workload is rate-limited
- **9 automated tests** verify the algorithm produces correct results
- **Full web dashboard** with live charts, recommendation panel, and benchmark history
- **macOS + Linux** support after PR #1 build fix

---

*SmartIPC — VIT Operating Systems Project*
