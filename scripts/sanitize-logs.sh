#!/usr/bin/env bash
set -euo pipefail

# sanitize-logs.sh — Strip prompt injection patterns and secrets from CI logs
# before agent ingestion. Defense-in-depth layer for SECR-01.
#
# Usage: sanitize-logs.sh <input_file> <output_file>

INPUT_FILE="${1:?Usage: sanitize-logs.sh <input> <output>}"
OUTPUT_FILE="${2:?Usage: sanitize-logs.sh <input> <output>}"

# 1. Truncate to last 500 lines
tail -500 "$INPUT_FILE" > "$OUTPUT_FILE"

# 2. Strip prompt injection patterns (case-insensitive)
sed -i.bak -E \
  -e '/-- [Aa]dditional.*[Ii]nstruction/d' \
  -e '/IMPORTANT: [Yy]ou must/d' \
  -e '/IMPORTANT: [Pp]lease/d' \
  -e '/IMPORTANT: [Aa]lways/d' \
  -e '/^[Yy]ou are a /d' \
  -e '/^[Aa]ct as /d' \
  -e '/[Ii]gnore previous.*[Ii]nstructions/d' \
  -e '/[Ii]gnore all previous/d' \
  -e '/[Dd]isregard.*[Ii]nstructions/d' \
  -e '/<\/?[Ss][Yy][Ss][Tt][Ee][Mm]>/d' \
  -e '/\[\/?\/?[Ss][Yy][Ss][Tt][Ee][Mm]\]/d' \
  "$OUTPUT_FILE"

# 3. Strip shell injection patterns (backtick and $() substitution in suspicious contexts)
sed -i.bak -E \
  -e 's/`[^`]+`/[REMOVED]/g' \
  -e 's/\$\([^)]+\)/[REMOVED]/g' \
  "$OUTPUT_FILE"

# 4. Redact GitHub token patterns
sed -i.bak -E \
  -e 's/ghp_[A-Za-z0-9]{36,}/[REDACTED]/g' \
  -e 's/ghs_[A-Za-z0-9]{36,}/[REDACTED]/g' \
  -e 's/github_pat_[A-Za-z0-9_]{20,}/[REDACTED]/g' \
  -e 's/sk-[A-Za-z0-9_-]{20,}/[REDACTED]/g' \
  "$OUTPUT_FILE"

# 5. Redact common secret assignment patterns (preserve key name, redact value)
sed -i.bak -E \
  -e 's/(ANTHROPIC_API_KEY=).*/\1[REDACTED]/' \
  -e 's/(AWS_SECRET_ACCESS_KEY=).*/\1[REDACTED]/' \
  -e 's/(GITHUB_TOKEN=).*/\1[REDACTED]/' \
  "$OUTPUT_FILE"

# 6. Clean up sed backup files
rm -f "${OUTPUT_FILE}.bak"

echo "Sanitized: $(wc -l < "$OUTPUT_FILE" | tr -d ' ') lines"
