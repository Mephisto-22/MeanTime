#!/bin/sh
set -e

# Verify node_modules has packages installed on host mount
if [ ! -d "node_modules" ] || [ ! -d "node_modules/vue" ]; then
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
