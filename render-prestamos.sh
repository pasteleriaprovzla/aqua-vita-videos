#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

BRANCH="$(git branch --show-current)"
WORKFLOW="render-prestamos.yml"
ARTIFACT="video-prestamos"
OUTPUT_DIR="$ROOT_DIR/output"
OUTPUT_FILE="$OUTPUT_DIR/prestamos.mp4"

echo "→ Verificando sesión de GitHub CLI..."
gh auth status

echo "→ Preparando commit..."
git add .github/workflows/render-prestamos.yml render-prestamos.sh video/prestamos .gitignore

if ! git diff --cached --quiet; then
  git commit -m "video(prestamos): render del procedimiento completo"
else
  echo "  Sin cambios nuevos para commitear."
fi

echo "→ Publicando en origin/$BRANCH..."
git push origin "$BRANCH"

PREV_ID="$(gh run list \
  --workflow "$WORKFLOW" \
  --event workflow_dispatch \
  --branch "$BRANCH" \
  --limit 1 \
  --json databaseId \
  --jq '.[0].databaseId // empty')"

echo "→ Lanzando workflow $WORKFLOW..."
gh workflow run "$WORKFLOW" --ref "$BRANCH"

echo "→ Buscando el RUN_ID del dispatch..."
RUN_ID=""
for _ in $(seq 1 40); do
  RUN_ID="$(gh run list \
    --workflow "$WORKFLOW" \
    --event workflow_dispatch \
    --branch "$BRANCH" \
    --limit 1 \
    --json databaseId \
    --jq '.[0].databaseId // empty')"
  if [ -n "$RUN_ID" ] && [ "$RUN_ID" != "$PREV_ID" ]; then
    break
  fi
  RUN_ID=""
  sleep 3
done

if [ -z "$RUN_ID" ]; then
  echo "✗ No se pudo obtener el RUN_ID del workflow." >&2
  exit 1
fi

echo "  RUN_ID: $RUN_ID"
echo "→ Esperando el render (puede tardar varios minutos)..."
gh run watch "$RUN_ID" --exit-status

echo "→ Descargando artifact $ARTIFACT..."
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"
gh run download "$RUN_ID" --name "$ARTIFACT" --dir "$OUTPUT_DIR"

FOUND="$(find "$OUTPUT_DIR" -type f -name 'prestamos.mp4' | head -n 1)"
if [ -z "$FOUND" ]; then
  echo "✗ El artifact no contiene prestamos.mp4." >&2
  exit 1
fi

if [ "$FOUND" != "$OUTPUT_FILE" ]; then
  cp "$FOUND" "$OUTPUT_FILE"
fi

SIZE="$(du -h "$OUTPUT_FILE" | cut -f1)"
echo ""
echo "✅ Video listo en ./output/prestamos.mp4 ($SIZE)"
