from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .benchmark import ALLOWED, run_one
from .config import BENCHMARK_PATH, DB_PATH
from .models import BenchmarkRequest, CompareRequest, RecommendationRequest
from .recommender import recommend
from .storage import all_results, init_db, insert_result, list_results

@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="SmartIPC API",
    version="1.0.0",
    description="Benchmark, profile, and workload-aware IPC recommendation API.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "benchmark_binary": str(BENCHMARK_PATH),
        "benchmark_ready": BENCHMARK_PATH.exists(),
        "database": str(DB_PATH),
    }


@app.get("/api/ipc/methods")
def methods() -> dict:
    return {
        "methods": list(ALLOWED),
        "descriptions": {
            "pipe": "Anonymous Unix pipe between a parent and child process.",
            "shared_memory": "POSIX shared memory synchronized with POSIX named semaphores.",
            "message_queue": "System V message queue with chunked logical payloads.",
            "unix_socket": "Unix-domain stream socket using socketpair for local IPC.",
        },
    }


@app.get("/api/history")
def history(limit: int = Query(default=100, ge=1, le=1000)) -> dict:
    return {"results": list_results(limit)}


@app.post("/api/benchmark")
def benchmark(req: BenchmarkRequest) -> dict:
    try:
        result = run_one(req)
        record_id = insert_result(result)
        result["id"] = record_id
        return result
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/compare")
def compare(req: CompareRequest) -> dict:
    outputs = []
    for ipc in ALLOWED:
        benchmark_req = BenchmarkRequest(
            ipc=ipc,
            bytes=req.bytes,
            messages=req.messages,
            warmup=req.warmup,
            rate=req.rate,
            processes=req.processes,
        )
        try:
            result = run_one(benchmark_req)
            result["id"] = insert_result(result)
            outputs.append(result)
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=f"{ipc}: {exc}") from exc
    return {"results": outputs}


@app.post("/api/recommend")
def recommend_api(req: RecommendationRequest) -> dict:
    rows = all_results()
    load_1m = req.load_1m
    if load_1m is None:
        # Use the newest local observation when the dashboard did not provide load.
        load_1m = float(rows[-1]["load_1m"]) if rows else 0.0
    return recommend(rows, bytes_=req.bytes, rate=req.rate, processes=req.processes, load_1m=load_1m)
