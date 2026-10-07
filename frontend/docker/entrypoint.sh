#!/bin/sh
set -e

cd /app

# Redirect home and package manager caches off the host mount to /tmp
export HOME=/tmp
export PNPM_HOME=/tmp/.pnpm
export NPM_CONFIG_CACHE=/tmp/.npm
export npm_config_cache=/tmp/.npm

# Ensure permissive creation mask for Windows host file sharing
umask 000

# Ensure target directories exist with permissive rights
mkdir -p node_modules .nuxt || true
chmod 777 node_modules .nuxt 2>/dev/null || true

# Verify node_modules has packages installed on host mount
if [ ! -x node_modules/.bin/nuxt ] || [ ! -d "node_modules/vue" ]; then
  echo "Installing frontend dependencies into host volume with pnpm..."
  pnpm install
fi

# Ensure Nuxt types are generated into .nuxt on host mount for IDE autocompletion
if [ ! -d ".nuxt" ] || [ ! -f ".nuxt/tsconfig.json" ]; then
  echo "Generating Nuxt types into host volume..."
  pnpm postinstall
fi

echo "Starting frontend dev server: $@"
exec "$@"
