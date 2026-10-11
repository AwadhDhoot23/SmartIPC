# SmartIPC

**Adaptive Inter-Process Communication Recommendation System**

SmartIPC benchmarks four Linux IPC mechanisms — Pipe, Shared Memory, Message Queue, and Unix Socket — then uses a data-driven algorithm to recommend the best one for any given workload. Recommendations are based on real measurements taken on your machine, not textbook assumptions.

> **Group Project** · VIT · Operating Systems Course  
> Contributors: Awadh Dhoot · AV (Aryavardhan Sharma)

> 💡 **Faculty Presentation Guide:**  
> For faculty review and project viva/demo, see [PRESENTATION.md](./docs/PRESENTATION.md) — a dedicated, conceptual explanation covering the core problem, the 4 IPC mechanisms, WAISA algorithm logic, and live demo test cases.

---

## What It Does

You tell SmartIPC:
- How big your messages are (e.g. 64 bytes or 64 KB)
- How fast you want to send them (max speed, or a fixed rate like 500 msg/s)

SmartIPC then:
1. **Benchmarks** all four IPC methods on your actual machine
2. **Stores** the results in a local database
3. **Recommends** the best IPC method using a nearest-profile matching algorithm
4. **Shows** you live charts of latency, throughput, CPU, and memory usage

---

## The Four IPC Mechanisms

| Mechanism | How It Works | Best For |
|---|---|---|
| **Pipe** | Anonymous byte stream between parent & child via kernel buffer | Tiny messages, simple two-process setups |
| **Shared Memory** | Both processes map the same physical RAM; no kernel copy needed | Large payloads where copy cost dominates |
| **Message Queue** | System V kernel queue; messages are discrete chunks | Structured messages, decoupled producers/consumers |
| **Unix Socket** | Full-duplex stream socket over a kernel-buffered channel | Rate-limited / paced workloads needing flow control |

---

## Architecture

```
+---------------------------------+
|    React Dashboard (UI)         |  <- Vite dev server :5173
+----------------+----------------+
                 |  HTTP/JSON
+----------------v----------------+
|      FastAPI Backend            |  <- uvicorn :8000
|  +---------------------------+  |
|  |   WAISA Recommender       |  |  <- Python algorithm
|  +---------------------------+  |
|  +---------------------------+  |
|  |     SQLite Database       |  |  <- benchmark history
|  +---------------------------+  |
+----------------+----------------+
                 |  subprocess
+----------------v----------------+
|   C++17 Benchmark Engine        |  <- fork() + IPC syscalls
|  Pipe | SHM | MsgQ | Sock       |
+---------------------------------+
```

---

## Project Structure

```
SmartIPC_final/
+-- README.md                   # System documentation & setup guide
+-- cpp/                        # C++ benchmark binary
|   +-- src/
|   |   +-- main.cpp            # CLI entry point
|   |   +-- benchmark.cpp       # IPC timing & measurement
|   +-- include/
|   |   +-- benchmark.hpp       # Shared headers
|   +-- Makefile                # Builds smartipc_bench (Linux + macOS)
|
+-- backend/                    # Python FastAPI server
|   +-- app/
|       +-- main.py             # REST API routes
|       +-- recommender.py      # WAISA algorithm
|       +-- benchmark.py        # Subprocess runner
|       +-- storage.py          # SQLite persistence
|       +-- models.py           # Pydantic request models
|       +-- config.py           # Paths & env variables
|
+-- frontend/                   # React + Vite dashboard
|   +-- src/
|       +-- App.jsx             # Root component
|       +-- main.jsx            # React entry point
|       +-- styles.css          # Global styles
|       +-- components/         # UI components (added in PR #1)
|       |   +-- WorkloadPanel.jsx
|       |   +-- RecommendationPanel.jsx
|       |   +-- ResultsPanel.jsx
|       |   +-- MetricCards.jsx
|       |   +-- HistoryPanel.jsx
|       |   +-- Header.jsx
|       |   +-- Pipeline.jsx
|       |   +-- Grainient.jsx   # Animated gradient background
|       |   +-- Hyperspeed.jsx  # WebGL star-field animation
|       |   +-- ShapeGrid.jsx   # Animated shape grid
|       |   +-- LetterGlitch.jsx
|       +-- lib/                # Shared helpers (added in PR #1)
|           +-- api.js          # API client functions
|           +-- constants.js    # IPC labels & colours
|           +-- format.js       # Number formatting
|
+-- tests/                      # pytest test suite
|   +-- test_recommender.py     # Algorithm unit tests (9 cases)
|   +-- test_cpp_smoke.py       # C++ binary smoke test
|   +-- test_api_import.py      # FastAPI import test
|
+-- scripts/
|   +-- profile.py              # Seed the DB with benchmark profiles
|   +-- export_csv.py           # Export results to CSV
|   +-- run_demo.sh             # One-command demo runner
|   +-- check_environment.sh   # Environment verifier
|
+-- docs/                       # Project documentation
|   +-- PRESENTATION.md         # Faculty project walkthrough & viva defense guide
|   +-- DETAILED_DESIGN.md
|   +-- PROJECT_REPORT.md
|   +-- EXPERIMENT_PLAN.md
|   +-- VIVA.md / DEMO_SCRIPT.md
|   +-- SETUP_WSL.md
|   +-- RESEARCH_NOTES.md / LITERATURE.md
|   +-- CHANGELOG.md
|
+-- data/                       # SQLite DB (git-ignored)
+-- Makefile                    # Top-level build shortcuts
+-- .env.example                # Optional path overrides
+-- VERSION                     # 1.1.0
```

---

## Quick Start

### Prerequisites

- Linux or WSL2 (Ubuntu recommended)
- `g++` (C++17) and `make`
- Python 3.10+ with `pip`
- Node.js 18+

### Step 1 — Build the C++ benchmark engine

```bash
cd ~/SmartIPC_final/cpp
make
```

Produces `cpp/build/smartipc_bench`.

### Step 2 — Start the Python backend

```bash
cd ~/SmartIPC_final/backend
source .venv/bin/activate        # or: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Step 3 — Start the frontend

```bash
# New terminal
cd ~/SmartIPC_final/frontend
npm install
npm run dev
```

Open **http://localhost:5173**

### Step 4 — Seed the database

The recommender needs stored benchmark data to work. Run once:

```bash
cd ~/SmartIPC_final
source backend/.venv/bin/activate
python3 scripts/profile.py --quick
```

For a richer dataset:

```bash
python3 scripts/profile.py \
  --sizes 64,512,4096,65536 \
  --rates 0,500,2000 \
  --messages 1000 \
  --warmup 100 \
  --repetitions 5
```

### Makefile shortcuts

```bash
make build    # Build C++ engine
make test     # Build + run pytest suite
make profile  # Quick profile seed
make export   # Export DB to CSV
make clean    # Remove build + DB
```

---

## REST API

Auto-docs: `http://localhost:8000/docs`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Server + binary status |
| `GET` | `/api/ipc/methods` | List IPC mechanisms |
| `POST` | `/api/benchmark` | Run one IPC benchmark |
| `POST` | `/api/compare` | Benchmark all 4 methods |
| `POST` | `/api/recommend` | Get a recommendation |
| `GET` | `/api/history` | Fetch stored results |

```bash
# Example recommendation request
curl -s -X POST http://localhost:8000/api/recommend \
  -H "Content-Type: application/json" \
  -d '{"bytes": 65536, "rate": 0, "processes": 2}'
```

---

## The WAISA Algorithm

**Workload-Aware Adaptive IPC Selection Algorithm** (`backend/app/recommender.py`)

1. **Regime separation** — paced (`rate > 0`) and max-rate runs are kept separate so throughput comparisons are fair.
2. **Workload encoding** — target is encoded as `(log1p(bytes), log1p(rate), processes, load_1m)`.
3. **Replicate aggregation** — repeated trials for the same workload/IPC are averaged before matching.
4. **Shared-workload matching** — interpolation only over workloads that every mechanism has been measured on, so comparisons are like-for-like.
5. **Exact-match shortcut** — if the exact `(bytes, rate, processes)` is in the database, it is used directly.
6. **Shepard inverse-distance weighting** — `w = 1 / distance²`; nearer profiles dominate strongly.
7. **Noise floor (5%)** — if metric spread is < 5% of mean, all mechanisms score 0.5 (tie) on that metric. Prevents noise from deciding the winner.
8. **Dual-regime weighted scoring**:

| Mode | Throughput | Avg Latency | P95 Latency | CPU | RAM |
|---|---|---|---|---|---|
| Max-rate (`rate=0`) | 40% | 30% | — | 20% | 10% |
| Paced (`rate>0`) | — | 45% | 30% | 15% | 10% |

9. **Confidence scaling** — base 0.65–0.80, boosted by margin and evidence count, then scaled by `(mechanisms_profiled / 4)`.
10. **Explainability** — response names the dominant metric, the runner-up, and whether values were exact or interpolated (`match_basis`).

---

## Benchmark Metrics

| Metric | Unit | Description |
|---|---|---|
| `avg_latency_us` | µs | Mean round-trip latency |
| `p50_latency_us` | µs | Median latency |
| `p95_latency_us` | µs | 95th-percentile latency |
| `max_latency_us` | µs | Worst-case latency |
| `throughput_mbps` | MB/s | Data rate |
| `cpu_percent` | % | Parent + child CPU (can exceed 100% on multi-core) |
| `peak_rss_mb` | MB | Larger of the two processes' peak RSS |
| `load_1m` | — | System 1-min load average at run time |
| `page_size` | bytes | OS memory page size |

---

## Recent Changes — PR #1

**Merged October 11, 2026** by Aryavardhan Sharma

### Recommender — fully data-driven (no hand-tuned bonuses)
- Removed all hard-coded per-mechanism penalties/bonuses.
- Regime separation: paced and max-rate profiles no longer mixed.
- Shared-workload matching: interpolation over workloads common to all mechanisms.
- Shepard weighting (`1/d²`) replaces previous `1/(1+d)`.
- Noise floor raised from 1% to 5%.
- Confidence scaled down when mechanisms are missing profiles.
- Response now includes `match_basis` (`exact` / `shared` / `own`) and names the runner-up.

### C++ — macOS build support
- `librt` linked only on Linux (`ifeq $(shell uname -s)`).
- `ru_maxrss` normalised for macOS (Apple reports bytes; Linux reports KiB).

### Frontend — component refactor + new visual design
- `main.jsx` monolith split into `App.jsx`, `components/`, and `lib/`.
- Inter and JetBrains Mono fonts.
- Animated backgrounds: `Hyperspeed` (WebGL), `Grainient`, `ShapeGrid`, `LetterGlitch`.
- Centralised `lib/api.js`, `lib/constants.js`, `lib/format.js`.

### Tests
- Expanded from 3 to 9 passing test cases.
- Added paced-mode coverage (Unix Socket must win at `rate > 0`).
- Added large-payload coverage (Shared Memory must win at `bytes = 65536`).

---

## Configuration

```bash
# .env (copy from .env.example)
SMARTIPC_DB_PATH=/path/to/data/smartipc.db
SMARTIPC_BENCHMARK_PATH=/path/to/cpp/build/smartipc_bench
```

---

## Running Tests

```bash
cd ~/SmartIPC_final
source backend/.venv/bin/activate
make test
# or: python3 -m pytest -q tests/
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Benchmark engine | C++17, POSIX APIs, `fork()`, `getrusage()` |
| Backend | Python 3.14, FastAPI, uvicorn, Pydantic v2, SQLite3 |
| Frontend | React 18, Vite, Three.js / OGL (WebGL animations) |
| Fonts | Inter, JetBrains Mono |
| Tests | pytest (9 cases) |

---

*Research prototype — VIT Operating Systems Project*
