#!/usr/bin/env bash
set -e

echo "🚀 Starting GhostSystems build..."

# Clean install dependencies
npm ci --omit=dev || npm install --omit=dev

# Rebuild any native modules like sqlite3
npm rebuild sqlite3 --build-from-source

echo "✅ Build complete. Ready to deploy."
