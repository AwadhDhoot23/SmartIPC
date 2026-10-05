from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field

IPCName = Literal["pipe", "shared_memory", "message_queue", "unix_socket"]


class BenchmarkRequest(BaseModel):
    ipc: IPCName
    bytes: int = Field(default=1024, ge=1, le=16 * 1024 * 1024)
    messages: int = Field(default=1000, ge=1, le=100_000)
    warmup: int = Field(default=100, ge=0, le=10_000)
    rate: float = Field(default=0.0, ge=0.0, le=1_000_000.0)
    processes: int = Field(default=2, ge=2, le=2)


class CompareRequest(BaseModel):
    bytes: int = Field(default=1024, ge=1, le=16 * 1024 * 1024)
    messages: int = Field(default=1000, ge=1, le=100_000)
    warmup: int = Field(default=100, ge=0, le=10_000)
    rate: float = Field(default=0.0, ge=0.0, le=1_000_000.0)
    processes: int = Field(default=2, ge=2, le=2)


class RecommendationRequest(BaseModel):
    bytes: int = Field(default=1024, ge=1, le=16 * 1024 * 1024)
    rate: float = Field(default=0.0, ge=0.0, le=1_000_000.0)
    processes: int = Field(default=2, ge=2, le=2)
    load_1m: float | None = Field(default=None, ge=0.0, le=1024.0)
