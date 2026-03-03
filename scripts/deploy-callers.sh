#!/usr/bin/env bash
set -euo pipefail

# deploy-callers.sh -- Deploy auto-fix-caller.yml and promote-caller.yml to repos in repo-stack-map.json
#
# Usage:
#   bash scripts/deploy-callers.sh [--dry-run]
#
# Prerequisites: gh (GitHub CLI, authenticated), jq, base64
#
# For each repo in config/repo-stack-map.json:
#   1. Discovers CI workflow names from the repo's .github/workflows/ directory
#   2. Deploys auto-fix-caller.yml with the discovered workflow names
#   3. Deploys promote-caller.yml if promotion.enabled is true for the repo
#
# With --dry-run, shows what would be deployed without making changes.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$REPO_ROOT/config/repo-stack-map.json"
AUTO_FIX_TEMPLATE="$REPO_ROOT/.github/workflows/auto-fix-caller.example.yml"
PROMOTE_TEMPLATE="$REPO_ROOT/.github/workflows/promote-caller.example.yml"

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "=== DRY RUN MODE ==="
  echo ""
fi

# --- Dependency checks ---
for cmd in gh jq base64; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: $cmd is required but not found. Install it and try again."
    exit 1
  fi
done

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "ERROR: Config file not found: $CONFIG_FILE"
  exit 1
fi

# --- CI workflow name include/exclude heuristics ---
CI_INCLUDE_PATTERN="(CI|Build|Test|Pipeline|Checks|PR|Lint)"
CI_EXCLUDE_PATTERN="(Deploy|Release|CD$|CodeQL|E2E|Preview|Validation|Utilities|Promote|Auto Fix)"

# --- Read repos from config ---
REPOS=$(jq -r '.repos | keys[]' "$CONFIG_FILE")

# Tracking for summary table
declare -a SUMMARY_REPO=()
declare -a SUMMARY_AUTOFIX=()
declare -a SUMMARY_PROMOTE=()
declare -a SUMMARY_WORKFLOWS=()

for REPO in $REPOS; do
  echo "--- $REPO ---"

  # Get default branch
  DEFAULT_BRANCH=$(gh api "repos/$REPO" --jq '.default_branch' 2>/dev/null || echo "UNKNOWN")
  if [[ "$DEFAULT_BRANCH" == "UNKNOWN" ]]; then
    echo "  WARNING: Cannot access repo. Skipping."
    SUMMARY_REPO+=("$REPO")
    SUMMARY_AUTOFIX+=("SKIP (no access)")
    SUMMARY_PROMOTE+=("SKIP (no access)")
    SUMMARY_WORKFLOWS+=("N/A")
    echo ""
    continue
  fi

  # Check push access
  HAS_PUSH=$(gh api "repos/$REPO" --jq '.permissions.push' 2>/dev/null || echo "false")
  if [[ "$HAS_PUSH" != "true" ]]; then
    echo "  WARNING: No push access to $REPO. Skipping."
    SUMMARY_REPO+=("$REPO")
    SUMMARY_AUTOFIX+=("SKIP (no push)")
    SUMMARY_PROMOTE+=("SKIP (no push)")
    SUMMARY_WORKFLOWS+=("N/A")
    echo ""
    continue
  fi

  # --- auto-fix-caller.yml ---
  AUTOFIX_STATUS="SKIP"
  DISCOVERED_WORKFLOWS=""

  # Check if already exists
  EXISTING=$(gh api "repos/$REPO/contents/.github/workflows/auto-fix-caller.yml" --jq '.name' 2>/dev/null || echo "")
  if [[ "$EXISTING" == "auto-fix-caller.yml" ]]; then
    echo "  auto-fix-caller.yml: ALREADY DEPLOYED"
    AUTOFIX_STATUS="EXISTS"
  else
    # Discover CI workflow names from the repo
    WORKFLOW_FILES=$(gh api "repos/$REPO/contents/.github/workflows" --jq '.[].name' 2>/dev/null || echo "")

    if [[ -z "$WORKFLOW_FILES" ]]; then
      echo "  WARNING: No .github/workflows/ directory found. Skipping auto-fix-caller.yml."
      AUTOFIX_STATUS="SKIP (no workflows dir)"
    else
      CI_NAMES=""
      for WF_FILE in $WORKFLOW_FILES; do
        # Get the raw content and extract the name: field
        WF_CONTENT=$(gh api "repos/$REPO/contents/.github/workflows/$WF_FILE" --jq '.content' 2>/dev/null | base64 -d 2>/dev/null || echo "")
        WF_NAME=$(echo "$WF_CONTENT" | grep -m1 '^name:' | sed 's/^name:[[:space:]]*//' | sed 's/^["'\'']//' | sed 's/["'\'']\s*$//' || echo "")

        if [[ -z "$WF_NAME" ]]; then
          continue
        fi

        # Apply include/exclude heuristics
        if echo "$WF_NAME" | grep -qEi "$CI_INCLUDE_PATTERN" && ! echo "$WF_NAME" | grep -qEi "$CI_EXCLUDE_PATTERN"; then
          if [[ -n "$CI_NAMES" ]]; then
            CI_NAMES="$CI_NAMES, \"$WF_NAME\""
          else
            CI_NAMES="\"$WF_NAME\""
          fi
        fi
      done

      if [[ -z "$CI_NAMES" ]]; then
        echo "  WARNING: No CI workflows found (zero matches after filtering). Skipping auto-fix-caller.yml."
        AUTOFIX_STATUS="SKIP (no CI workflows)"
      else
        DISCOVERED_WORKFLOWS="$CI_NAMES"
        echo "  Discovered CI workflows: [$CI_NAMES]"

        # Generate customized auto-fix-caller.yml
        CALLER_CONTENT="# Auto-Fix Caller -- deployed by deploy-callers.sh
# The name must match the 'name:' field in your CI workflow YAML exactly.
# This file must exist on the repo's default branch for workflow_run to trigger.
name: Auto Fix
on:
  workflow_run:
    workflows: [$CI_NAMES]
    types: [completed]
jobs:
  fix:
    if: github.event.workflow_run.conclusion == 'failure'
    uses: fbetancourtc/auto-fix-agent/.github/workflows/auto-fix.yml@main
    with:
      app_id: \"2985828\"
      failed_run_id: \"\${{ github.event.workflow_run.id }}\"
      repository: \"\${{ github.repository }}\"
      head_branch: \"\${{ github.event.workflow_run.head_branch }}\"
    secrets: { anthropic_api_key: \"\${{ secrets.ANTHROPIC_API_KEY }}\", app_private_key: \"\${{ secrets.AUTO_FIX_APP_PRIVATE_KEY }}\" }"

        if [[ "$DRY_RUN" == "true" ]]; then
          echo "  [DRY RUN] Would deploy auto-fix-caller.yml to $REPO ($DEFAULT_BRANCH)"
          AUTOFIX_STATUS="WOULD DEPLOY"
        else
          B64=$(printf '%s' "$CALLER_CONTENT" | base64)
          RESULT=$(gh api --method PUT "repos/$REPO/contents/.github/workflows/auto-fix-caller.yml" \
            -f message="ci: add auto-fix-caller.yml for auto-fix-agent integration" \
            -f content="$B64" \
            -f branch="$DEFAULT_BRANCH" \
            --jq '.content.name' 2>&1 || echo "FAILED")
          if [[ "$RESULT" == "auto-fix-caller.yml" ]]; then
            echo "  auto-fix-caller.yml: DEPLOYED"
            AUTOFIX_STATUS="DEPLOYED"
          else
            echo "  ERROR deploying auto-fix-caller.yml: $RESULT"
            AUTOFIX_STATUS="FAILED"
          fi
        fi
      fi
    fi
  fi

  # --- promote-caller.yml ---
  PROMOTE_STATUS="SKIP"

  # Check if promotion is enabled for this repo
  # Note: jq's // operator treats false as falsy, so we use explicit null check
  PROMO_OVERRIDE=$(jq -r "if .repos[\"$REPO\"].promotion | has(\"enabled\") then .repos[\"$REPO\"].promotion.enabled | tostring else \"null\" end" "$CONFIG_FILE" 2>/dev/null || echo "null")
  PROMO_DEFAULT=$(jq -r '.defaults.promotion.enabled' "$CONFIG_FILE")

  if [[ "$PROMO_OVERRIDE" == "false" ]]; then
    PROMOTE_ENABLED=false
  elif [[ "$PROMO_OVERRIDE" == "true" ]]; then
    PROMOTE_ENABLED=true
  elif [[ "$PROMO_OVERRIDE" == "null" ]]; then
    PROMOTE_ENABLED=$PROMO_DEFAULT
  else
    PROMOTE_ENABLED=$PROMO_DEFAULT
  fi

  if [[ "$PROMOTE_ENABLED" != "true" ]]; then
    echo "  promote-caller.yml: SKIP (promotion.enabled=false)"
    PROMOTE_STATUS="SKIP (disabled)"
  else
    # Check if already exists
    EXISTING_PROMOTE=$(gh api "repos/$REPO/contents/.github/workflows/promote-caller.yml" --jq '.name' 2>/dev/null || echo "")
    if [[ "$EXISTING_PROMOTE" == "promote-caller.yml" ]]; then
      echo "  promote-caller.yml: ALREADY DEPLOYED"
      PROMOTE_STATUS="EXISTS"
    else
      if [[ "$DRY_RUN" == "true" ]]; then
        echo "  [DRY RUN] Would deploy promote-caller.yml to $REPO ($DEFAULT_BRANCH)"
        PROMOTE_STATUS="WOULD DEPLOY"
      else
        B64_PROMOTE=$(base64 < "$PROMOTE_TEMPLATE")
        RESULT_PROMOTE=$(gh api --method PUT "repos/$REPO/contents/.github/workflows/promote-caller.yml" \
          -f message="ci: add promote-caller.yml for auto-fix promotion flow" \
          -f content="$B64_PROMOTE" \
          -f branch="$DEFAULT_BRANCH" \
          --jq '.content.name' 2>&1 || echo "FAILED")
        if [[ "$RESULT_PROMOTE" == "promote-caller.yml" ]]; then
          echo "  promote-caller.yml: DEPLOYED"
          PROMOTE_STATUS="DEPLOYED"
        else
          echo "  ERROR deploying promote-caller.yml: $RESULT_PROMOTE"
          PROMOTE_STATUS="FAILED"
        fi
      fi
    fi
  fi

  SUMMARY_REPO+=("$REPO")
  SUMMARY_AUTOFIX+=("$AUTOFIX_STATUS")
  SUMMARY_PROMOTE+=("$PROMOTE_STATUS")
  SUMMARY_WORKFLOWS+=("${DISCOVERED_WORKFLOWS:-N/A}")
  echo ""
done

# --- Summary table ---
echo "=============================================="
echo "DEPLOYMENT SUMMARY"
echo "=============================================="
printf "%-50s %-20s %-20s %s\n" "REPO" "AUTO-FIX" "PROMOTE" "WORKFLOWS"
printf "%-50s %-20s %-20s %s\n" "----" "--------" "-------" "---------"
for i in "${!SUMMARY_REPO[@]}"; do
  printf "%-50s %-20s %-20s %s\n" "${SUMMARY_REPO[$i]}" "${SUMMARY_AUTOFIX[$i]}" "${SUMMARY_PROMOTE[$i]}" "${SUMMARY_WORKFLOWS[$i]}"
done
echo ""
echo "Done."
