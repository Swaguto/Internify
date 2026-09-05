#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

PYTHON="${PYTHON:-$(pwd)/.venv/bin/python}"
export PYTHONPATH="$(pwd)/deps${PYTHONPATH:+:$PYTHONPATH}"

cd "$(dirname "$0")"
exec "$PYTHON" -m uvicorn app:app --host 0.0.0.0 --port "${PORT:-8000}" "$@"