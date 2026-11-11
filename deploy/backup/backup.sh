#!/usr/bin/env bash
# Faz o dump do banco e envia para gs://$BACKUP_BUCKET/gymdb-AAAAMMDD-HHMMSS.dump
# Variáveis: DIRECT_URL (conexão direta, sem pooler) e BACKUP_BUCKET.
set -euo pipefail
: "${DIRECT_URL:?defina DIRECT_URL}"
: "${BACKUP_BUCKET:?defina BACKUP_BUCKET}"

stamp=$(date -u +%Y%m%d-%H%M%S)
file="/tmp/gymdb-${stamp}.dump"

echo "Gerando dump…"
pg_dump --format=custom --no-owner --no-privileges --dbname="$DIRECT_URL" --file="$file"
size=$(du -h "$file" | cut -f1)

echo "Enviando ${size} para gs://${BACKUP_BUCKET}/"
gcloud storage cp "$file" "gs://${BACKUP_BUCKET}/gymdb-${stamp}.dump" --quiet
rm -f "$file"
echo "Backup concluído: gymdb-${stamp}.dump"
