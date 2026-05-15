#!/usr/bin/env bash
set -euo pipefail

URL="http://localhost:8006/health"

echo "==> Checking local RPA server..."
echo "$URL"
echo ""

curl -i "$URL"