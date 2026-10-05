# SmartIPC on Windows + WSL2

SmartIPC's C++ benchmark uses Unix/Linux IPC APIs (`fork`, anonymous pipes, POSIX shared memory, System V message queues, and Unix-domain sockets). Run the project inside a real Ubuntu WSL2 distribution, not the `docker-desktop` WSL distribution.

## 1. Install Ubuntu WSL2

From an elevated PowerShell:

```powershell
wsl --install -d Ubuntu
```

After restarting if Windows asks, open **Ubuntu** from the Start menu and create your Linux username/password.

Verify:

```bash
cat /etc/os-release
```

The result should identify Ubuntu.

## 2. Install build tools

```bash
sudo apt update
sudo apt install build-essential python3 python3-venv
```

Check the environment from the project root:

```bash
bash scripts/check_environment.sh
```

## 3. Build SmartIPC

```bash
cd cpp
make clean
make
```

## 4. Run the first benchmark

```bash
./build/smartipc_bench --ipc pipe --bytes 1024 --messages 1000 --warmup 100 --rate 0
```

Then test the other IPC mechanisms by changing `--ipc` to:

```text
shared_memory
message_queue
unix_socket
```

## 5. Run a real profile

From the project root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
python3 scripts/profile.py --quick --repetitions 3
```

For the report-quality matrix:

```bash
python3 scripts/profile.py \
  --sizes 64,256,1024,4096,16384 \
  --rates 0,1000,5000 \
  --messages 1000 \
  --warmup 100 \
  --repetitions 5
```

This stores every measured trial in `data/smartipc.db`.

## 6. Start the API

```bash
cd backend
source ../.venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Check:

```text
http://127.0.0.1:8000/docs
```

## 7. Start the React dashboard

Use another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite.

## 8. Important measurement rule

Do not copy development benchmark numbers into the final report. Run the matrix on the machine used for evaluation, keep the environment reasonably idle, and report the machine/OS/kernel/compiler details alongside the measurements.
