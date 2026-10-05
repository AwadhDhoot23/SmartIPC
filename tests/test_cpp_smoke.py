import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BINARY = ROOT / "cpp" / "build" / "smartipc_bench"


def test_all_ipc_smoke():
    assert BINARY.exists()
    for ipc in ["pipe", "shared_memory", "message_queue", "unix_socket"]:
        cp = subprocess.run(
            [str(BINARY), "--ipc", ipc, "--bytes", "64", "--messages", "5", "--warmup", "2", "--rate", "0"],
            capture_output=True, text=True, timeout=10, check=True,
        )
        data = json.loads(cp.stdout.strip().splitlines()[-1])
        assert data["ipc"] == ipc
        assert data["messages"] == 5
        assert data["avg_latency_us"] > 0
        assert data["throughput_mbps"] > 0
