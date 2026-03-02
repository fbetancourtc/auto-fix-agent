#!/usr/bin/env bash
set -euo pipefail

# validate-diff.sh — Post-agent diff validation for FIXG-02 / FIXG-03
# Checks git diff against allowed_dirs from repo-stack-map.json.
# Reverts any forbidden file changes. Exits with status indicating result.
#
# Usage: validate-diff.sh <repo> <config-path>
# Exit codes: 0 = clean (all changes allowed or forbidden files reverted)
#             1 = no changes detected (agent produced no diff)

REPO="${1:?Usage: validate-diff.sh <repo> <config-path>}"
CONFIG="${2:?Usage: validate-diff.sh <repo> <config-path>}"

# Get allowed directories for this repo
# First check for per-repo override, then fall back to stack default
STACK=$(jq -r --arg repo "$REPO" '.repos[$repo].stack // empty' "$CONFIG")
if [ -z "$STACK" ]; then
  echo "ERROR: Repo '$REPO' not found in config"
  exit 1
fi

REPO_DIRS=$(jq -r --arg repo "$REPO" '.repos[$repo].allowed_dirs // empty | .[]?' "$CONFIG" 2>/dev/null)
if [ -n "$REPO_DIRS" ]; then
  ALLOWED_DIRS="$REPO_DIRS"
else
  ALLOWED_DIRS=$(jq -r --arg stack "$STACK" '.defaults[$stack].allowed_dirs[]' "$CONFIG")
fi

if [ -z "$ALLOWED_DIRS" ]; then
  echo "ERROR: No allowed_dirs found for repo '$REPO' (stack: $STACK)"
  exit 1
fi

# Get list of changed files (staged and unstaged)
CHANGED_FILES=$(git diff --name-only HEAD 2>/dev/null || true)
STAGED_FILES=$(git diff --cached --name-only 2>/dev/null || true)
ALL_CHANGES=$(echo -e "${CHANGED_FILES}\n${STAGED_FILES}" | sort -u | grep -v '^$' || true)

if [ -z "$ALL_CHANGES" ]; then
  echo "WARNING: No file changes detected -- agent produced no diff"
  exit 1
fi

VIOLATIONS=()
ALLOWED_COUNT=0

while IFS= read -r file; do
  MATCH=false
  while IFS= read -r dir; do
    if [[ "$file" == "$dir"* ]]; then
      MATCH=true
      break
    fi
  done <<< "$ALLOWED_DIRS"

  if [ "$MATCH" = false ]; then
    VIOLATIONS+=("$file")
    git checkout HEAD -- "$file" 2>/dev/null || true
  else
    ALLOWED_COUNT=$((ALLOWED_COUNT + 1))
  fi
done <<< "$ALL_CHANGES"

echo "Diff validation: ${ALLOWED_COUNT} allowed file(s)"

if [ ${#VIOLATIONS[@]} -gt 0 ]; then
  echo "::warning::Reverted ${#VIOLATIONS[@]} forbidden file(s): ${VIOLATIONS[*]}"
  for v in "${VIOLATIONS[@]}"; do
    echo "  REVERTED: $v"
  done
fi

if [ "$ALLOWED_COUNT" -eq 0 ]; then
  echo "WARNING: All changes were in forbidden directories -- nothing to commit"
  exit 1
fi

echo "VALID: ${ALLOWED_COUNT} file(s) in allowed directories"
exit 0
