#!/usr/bin/env bash
set -euo pipefail

echo "==> Installing npm dependencies..."
npm install

echo "==> Building Windows x64 executable..."
npm run build:win

echo "==> Build complete:"
ls -lh dist/google-form-rpa.exe

echo ""
echo "Windows executable:"
echo "dist/google-form-rpa.exe"