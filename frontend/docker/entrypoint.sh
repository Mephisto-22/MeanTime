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
mkdir -p node_modules .nuxt /host_node_modules 2>/dev/null || true
chmod 777 node_modules .nuxt /host_node_modules 2>/dev/null || true

# Compute manifest hash from dependency configuration files
MANIFEST_HASH=$(cat package.json pnpm-lock.yaml* pnpm-workspace.yaml* .npmrc* 2>/dev/null | sha256sum | awk '{print $1}')

CONTAINER_HASH=""
if [ -f "node_modules/.installed_hash" ]; then
  CONTAINER_HASH=$(cat node_modules/.installed_hash 2>/dev/null || true)
fi

HOST_HASH=""
if [ -f "/host_node_modules/.installed_hash" ]; then
  HOST_HASH=$(cat /host_node_modules/.installed_hash 2>/dev/null || true)
fi

NEEDS_INSTALL=0
if [ "$CONTAINER_HASH" != "$MANIFEST_HASH" ] || [ ! -x "node_modules/.bin/nuxt" ] || [ ! -d "node_modules/vue" ]; then
  NEEDS_INSTALL=1
fi

if [ "$NEEDS_INSTALL" -eq 1 ]; then
  echo "Dependencies changed or missing in container volume. Installing with pnpm..."
  pnpm install
  echo "$MANIFEST_HASH" > node_modules/.installed_hash
fi

# Sync to host mount if host hash differs or host node_modules is unpopulated
NEEDS_HOST_SYNC=0
if [ "$HOST_HASH" != "$MANIFEST_HASH" ] || [ ! -d "/host_node_modules/vue" ] || [ "$NEEDS_INSTALL" -eq 1 ]; then
  NEEDS_HOST_SYNC=1
fi

if [ "$NEEDS_HOST_SYNC" -eq 1 ] && [ -d "/host_node_modules" ]; then
  echo "Syncing container node_modules to host filesystem for IDE autocompletion..."
  rsync -a --delete --no-owner --no-group --exclude='.installed_hash' node_modules/ /host_node_modules/
  echo "$MANIFEST_HASH" > /host_node_modules/.installed_hash
  echo "Host node_modules synchronized successfully."
fi

# Ensure Nuxt types are generated into .nuxt on host mount for IDE autocompletion
if [ ! -d ".nuxt" ] || [ ! -f ".nuxt/tsconfig.json" ] || [ "$NEEDS_INSTALL" -eq 1 ]; then
  echo "Generating Nuxt types into host volume..."
  pnpm postinstall
fi

echo "Starting frontend dev server: $@"
exec "$@"
