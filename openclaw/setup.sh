#!/usr/bin/env bash
set -euo pipefail

# setup.sh — Deploy CodeQual agent to local OpenClaw instance
# Run this script ON the machine where OpenClaw is installed.
#
# Usage:
#   1. Copy the openclaw/ directory to the target machine
#   2. cd into the openclaw/ directory
#   3. Run: bash setup.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCLAW_DIR="$HOME/.openclaw"
WORKSPACE_DIR="$OPENCLAW_DIR/workspace"
SKILLS_DIR="$WORKSPACE_DIR/skills"

echo "=== CodeQual Agent Setup ==="
echo ""

# 1. Create directory structure
echo "[1/7] Creating directory structure..."
mkdir -p "$WORKSPACE_DIR/memory"
mkdir -p "$WORKSPACE_DIR/interventions"
mkdir -p "$SKILLS_DIR/code-quality"
mkdir -p "$OPENCLAW_DIR/cron"

# 2. Copy configuration
echo "[2/7] Deploying configuration..."

if [ -f "$OPENCLAW_DIR/openclaw.json" ]; then
  echo "  WARNING: Existing openclaw.json found — backing up to openclaw.json.bak"
  cp "$OPENCLAW_DIR/openclaw.json" "$OPENCLAW_DIR/openclaw.json.bak"
fi
cp "$SCRIPT_DIR/openclaw.json" "$OPENCLAW_DIR/openclaw.json"

# 3. Copy workspace files
echo "[3/7] Deploying workspace files..."
for file in AGENTS.md SOUL.md IDENTITY.md TOOLS.md USER.md STATE.md; do
  cp "$SCRIPT_DIR/workspace/$file" "$WORKSPACE_DIR/$file"
  echo "  Deployed: $file"
done

# 4. Copy skills
echo "[4/7] Deploying code-quality skill..."
if [ -d "$SCRIPT_DIR/workspace/skills/code-quality" ]; then
  cp -r "$SCRIPT_DIR/workspace/skills/code-quality/"* "$SKILLS_DIR/code-quality/"
  echo "  Deployed: code-quality skill"
else
  echo "  SKIP: No skill files found (run setup again after creating skills)"
fi

# 5. Environment file
# 5. Deploy intervention tracking
echo "[5/7] Setting up intervention tracking..."
if [ ! -f "$WORKSPACE_DIR/interventions/COUNTER.txt" ]; then
  cp "$SCRIPT_DIR/workspace/interventions/COUNTER.txt" "$WORKSPACE_DIR/interventions/COUNTER.txt"
  echo "  Created intervention counter (starting at 1)"
else
  echo "  Existing counter found — preserving (currently at $(cat "$WORKSPACE_DIR/interventions/COUNTER.txt" | tr -d '[:space:]'))"
fi

# 6. Environment file
echo "[6/7] Checking environment..."
if [ ! -f "$OPENCLAW_DIR/.env" ]; then
  cp "$SCRIPT_DIR/.env.example" "$OPENCLAW_DIR/.env"
  echo "  Created .env from template — EDIT WITH REAL VALUES:"
  echo "    $OPENCLAW_DIR/.env"
else
  echo "  Existing .env found — skipping (check .env.example for new variables)"
fi

# 6. Create cron jobs
echo "[7/7] Setting up cron jobs..."
echo ""
echo "  Run these commands to create the scheduled jobs:"
echo ""
echo "  # Poll for CI failures every 10 minutes"
echo '  openclaw cron add --name "ci-failure-poll" --cron "*/10 * * * *" \'
echo '    --session isolated --announce \'
echo '    --message "Check all enrolled repos for failed CI runs in the last 15 minutes. For each failure found, run the CI Failure Fix workflow from AGENTS.md. Report results to Telegram."'
echo ""
echo "  # SOLID/DDD scan every 6 hours"
echo '  openclaw cron add --name "quality-scan" --cron "0 */6 * * *" \'
echo '    --session isolated --announce \'
echo '    --message "Run SOLID and DDD principle scans on recent commits (last 6 hours) across all enrolled repos. Report findings to Telegram. Create improvement PRs for high-severity violations."'
echo ""
echo "  # Daily summary at 9 AM"
echo '  openclaw cron add --name "daily-summary" --cron "0 9 * * *" \'
echo '    --tz "America/Bogota" --session isolated --announce \'
echo '    --message "Generate daily code quality summary: repos scanned, fixes applied, SOLID/DDD findings, open escalations. Write to memory/today.md and send summary to Telegram."'
echo ""

# Validation
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Edit secrets:  nano $OPENCLAW_DIR/.env"
echo "  2. Validate config: openclaw config:validate"
echo "  3. Pair Telegram:  Message your bot and run: openclaw pair telegram"
echo "  4. Create cron jobs: Run the cron commands above"
echo "  5. Test agent:     openclaw chat 'List enrolled repos from skills/code-quality/repo-config.json'"
echo ""
echo "Current enrolled repos: (from repo-config.json)"
if [ -f "$SKILLS_DIR/code-quality/repo-config.json" ]; then
  cat "$SKILLS_DIR/code-quality/repo-config.json" | grep -o '"[^"]*/' | sort | uniq || true
else
  echo "  (repo-config.json not yet deployed — will be created with skills)"
fi
