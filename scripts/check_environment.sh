#!/usr/bin/env bash
set -euo pipefail

required=(gcc g++ make python3 node npm)
missing=()

for cmd in "${required[@]}"; do
  if command -v "$cmd" >/dev/null 2>&1; then
    printf 'OK   %-8s %s\n' "$cmd" "$(command -v "$cmd")"
  else
    printf 'MISS %-8s\n' "$cmd"
    missing+=("$cmd")
  fi
done

if [[ -f /etc/os-release ]]; then
  echo "--- OS ---"
  . /etc/os-release
  printf 'NAME=%s\n' "${NAME:-unknown}"
  printf 'VERSION=%s\n' "${VERSION_ID:-unknown}"
fi

if (( ${#missing[@]} > 0 )); then
  echo
  echo "Missing tools: ${missing[*]}"
  echo "On Ubuntu/WSL2, install the C/C++ toolchain with:"
  echo "  sudo apt update && sudo apt install build-essential"
  echo "Then install Python/Node if they are not already present."
  exit 1
fi

echo "Environment looks ready for SmartIPC."
