#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT/cpp"
make
cd "$ROOT"

if [ ! -d "backend/.venv" ]; then
  python3 -m venv backend/.venv
  # shellcheck disable=SC1091
  source backend/.venv/bin/activate
  pip install -r backend/requirements.txt
else
  # shellcheck disable=SC1091
  source backend/.venv/bin/activate
fi

python3 scripts/profile.py --quick
printf '\nStart the API in another terminal:\n'
printf '  cd "%s/backend" && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000\n' "$ROOT"
printf '\nStart the UI in another terminal:\n'
printf '  cd "%s/frontend" && npm install && npm run dev\n' "$ROOT"
