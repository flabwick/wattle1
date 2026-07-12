#!/usr/bin/env bash
# Runs before `npm run dev` (see predev in package.json). tsx's file-watch restarts
# sometimes leave the previous process's listener orphaned instead of releasing
# port 4000 (or $PORT), so the next `npm run dev` fails with EADDRINUSE. This clears
# only a stale instance of *this* dev server — it checks each PID's command line and
# leaves anything else on the port alone, so it won't kill an unrelated process.
set -euo pipefail

PORT="${PORT:-4000}"
PIDS="$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"

for PID in $PIDS; do
  CMD="$(ps -p "$PID" -o command= 2>/dev/null || true)"
  case "$CMD" in
    *tsx*src/index.ts*|*dist/index.js*)
      echo "free-port: killing stale wattle api process on port $PORT (pid $PID)"
      kill -9 "$PID" 2>/dev/null || true
      ;;
    *)
      if [ -n "$CMD" ]; then
        echo "free-port: port $PORT is in use by an unrelated process (pid $PID: $CMD) — leaving it alone"
      fi
      ;;
  esac
done

exit 0
