#!/usr/bin/env bash
set -e

# scripts/mnc-auto-sync.sh
# Automated daily MNC career engine runner and Git auto-pusher

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

mkdir -p "$PROJECT_DIR/logs"
LOG_FILE="$PROJECT_DIR/logs/mnc-auto-sync.log"

DATE_STR=$(date +"%Y-%m-%d %H:%M:%S")
echo "=======================================================" >> "$LOG_FILE"
echo "🕒 [$DATE_STR] Initiating Daily MNC & High-Paying Tech Sync" >> "$LOG_FILE"
echo "=======================================================" >> "$LOG_FILE"

# 1. Run live fresh harvest and pipeline
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$(dirname $(which node)):$PATH"
node mnc-engine/scripts/mnc-daily-pipeline.mjs --fresh >> "$LOG_FILE" 2>&1 || {
  echo "❌ Error executing mnc-daily-pipeline.mjs" >> "$LOG_FILE"
  exit 1
}

# 2. Stage updated web portal and data files
git add docs/ mnc-engine/data/ data/daily-report-mnc-*.md >> "$LOG_FILE" 2>&1

# 3. Commit changes if any exist
if git diff --staged --quiet; then
  echo "ℹ️ No new changes to commit today." >> "$LOG_FILE"
else
  COMMIT_MSG="chore(radar): automated daily MNC jobs sync [$(date +%Y-%m-%d)]"
  git commit -m "$COMMIT_MSG" >> "$LOG_FILE" 2>&1
  echo "✅ Committed: $COMMIT_MSG" >> "$LOG_FILE"

  # 4. Push to remote main branch to update GitHub Pages live
  git push origin main >> "$LOG_FILE" 2>&1 || {
    echo "⚠️ Git push failed or remote was unreachable." >> "$LOG_FILE"
  }
  echo "🚀 Successfully pushed updates to origin main." >> "$LOG_FILE"
fi

echo "🎉 Finished MNC Daily Sync at $(date +"%Y-%m-%d %H:%M:%S")" >> "$LOG_FILE"
