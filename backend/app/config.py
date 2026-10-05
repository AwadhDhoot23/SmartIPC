from pathlib import Path
import os

APP_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = APP_DIR.parents[1]
DATA_DIR = PROJECT_ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = Path(os.getenv("SMARTIPC_DB_PATH", DATA_DIR / "smartipc.db"))
BENCHMARK_PATH = Path(
    os.getenv(
        "SMARTIPC_BENCHMARK_PATH",
        PROJECT_ROOT / "cpp" / "build" / "smartipc_bench",
    )
)
