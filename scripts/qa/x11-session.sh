#!/bin/sh
# A real window manager supplies activation/visibility events on an isolated Xvfb display.
set -eu
if [ "$#" -eq 0 ] || [ -z "${DISPLAY:-}" ]; then
  echo 'Usage: xvfb-run dbus-run-session -- sh scripts/qa/x11-session.sh COMMAND [ARGS...]' >&2
  exit 2
fi
openbox --sm-disable >/dev/null 2>&1 &
rokko_wm_pid=$!
cleanup() {
  kill "$rokko_wm_pid" 2>/dev/null || :
  wait "$rokko_wm_pid" 2>/dev/null || :
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
rokko_attempt=0
while ! xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null | grep -q 'window id'; do
  if ! kill -0 "$rokko_wm_pid" 2>/dev/null || [ "$rokko_attempt" -ge 50 ]; then
    echo 'The isolated X11 window manager did not start' >&2
    exit 1
  fi
  rokko_attempt=$((rokko_attempt + 1))
  sleep 0.1
done
"$@"
