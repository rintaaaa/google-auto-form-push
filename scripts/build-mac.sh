#!/usr/bin/env bash
set -euo pipefail

echo "==> Installing npm dependencies..."
npm install

echo "==> Installing Playwright Chromium..."
npx playwright install chromium

echo "==> Building macOS arm64 executable..."
npm run build:mac

echo "==> Adding execute permission..."
chmod +x dist/google-form-rpa-mac-arm64

echo "==> Build complete:"
ls -lh dist/google-form-rpa-mac-arm64

echo ""
echo "Run with:"
echo "./dist/google-form-rpa-mac-arm64"