# SmartIPC 5-Minute Demo

## Before the demo

```bash
cd cpp && make
cd ../backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000
```

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

## Demo flow

### 1. Explain the problem

Applications often choose one IPC mechanism even though workload characteristics change.

### 2. Show the architecture

Point from workload → benchmark → profile → decision.

### 3. Run a small workload

Use 64 B, 400–1000 messages, rate 0.

Click **Run all 4 benchmarks**.

### 4. Explain the measured differences

Show latency and throughput bars. Emphasize that the benchmark ran real OS primitives.

### 5. Change workload

Use 4096 B or 16384 B and/or set a higher target rate.

Run again.

### 6. Ask SmartIPC for a recommendation

The engine now has local profile evidence and should show a profile-based score.

### 7. Explain novelty carefully

The project is not claiming to create a new kernel IPC primitive. It creates a workload-aware selection layer that uses measured local behavior to choose a mechanism for the next controlled job.

## Strong viva sentence

> “We deliberately keep the adaptive layer in user space. Our research question is whether workload-aware selection from measured IPC profiles can outperform a fixed primitive, not whether we can transparently rewrite an arbitrary running process's kernel handles.”
