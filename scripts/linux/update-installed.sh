#!/bin/sh
set -e

cd "$(dirname "$0")/../.."
if ! command -v corepack >/dev/null 2>&1; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    unset PREFIX NPM_CONFIG_PREFIX npm_config_prefix
    . "$NVM_DIR/nvm.sh" --no-use
    nvm use --silent default
  fi
fi

if ! command -v corepack >/dev/null 2>&1; then
  echo 'Corepack is unavailable. Install it for the active Node.js version and try again.' >&2
  exit 127
fi

exec corepack pnpm update:installed "$@"
