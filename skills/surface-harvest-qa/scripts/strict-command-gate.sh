#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: strict-command-gate.sh <output-log> -- <command> [args...]

Runs the command, captures stdout+stderr into <output-log>, mirrors the output to
the terminal, and fails if the command exits non-zero or if the captured output
contains "command not found".
EOF
}

if [[ $# -lt 3 ]]; then
  usage
  exit 1
fi

OUTPUT_LOG="$1"
shift

if [[ "$1" != "--" ]]; then
  usage
  exit 1
fi
shift

mkdir -p "$(dirname "${OUTPUT_LOG}")"

TMP_OUTPUT="$(mktemp)"
cleanup() {
  rm -f "${TMP_OUTPUT}"
}
trap cleanup EXIT

set +e
"$@" >"${TMP_OUTPUT}" 2>&1
COMMAND_STATUS=$?
set -e

cat "${TMP_OUTPUT}" | tee "${OUTPUT_LOG}"

if rg -n -i '(^|: )command not found' "${TMP_OUTPUT}" >/dev/null 2>&1; then
  echo "FAIL: command output contained 'command not found' (${OUTPUT_LOG})" >&2
  exit 1
fi

if (( COMMAND_STATUS != 0 )); then
  echo "FAIL: command exited with status ${COMMAND_STATUS} (${OUTPUT_LOG})" >&2
  exit "${COMMAND_STATUS}"
fi

echo "PASS: command completed without shell lookup failures (${OUTPUT_LOG})"
