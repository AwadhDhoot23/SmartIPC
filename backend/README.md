# SmartIPC Backend

FastAPI service for running the C++ benchmark, persisting measurements, and generating workload-aware IPC recommendations.

Start from the `backend` directory after building the C++ binary:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
