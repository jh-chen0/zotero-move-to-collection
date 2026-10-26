#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
VERSION=$(python3 - <<'PY'
import json
with open('manifest.json', encoding='utf-8') as f:
    print(json.load(f)['version'])
PY
)

mkdir -p dist
OUT="dist/move-to-collection-${VERSION}.xpi"
rm -f "$OUT"
zip -9 "$OUT" manifest.json bootstrap.js README.md LICENSE >/dev/null
printf 'Built %s\n' "$OUT"
