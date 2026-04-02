#!/bin/bash
# Session Start Hook — loads project context into Claude's conversation
PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

echo "=== JARGON SESSION CONTEXT ==="
echo ""

# Progress log
if [ -f "$PROJECT_DIR/docs/PROGRESS.md" ]; then
  echo "--- PROGRESS LOG ---"
  cat "$PROJECT_DIR/docs/PROGRESS.md"
  echo ""
fi

# Latest spec
LATEST_SPEC=$(ls -t "$PROJECT_DIR/docs/superpowers/specs/"*.md 2>/dev/null | head -1)
if [ -n "$LATEST_SPEC" ]; then
  echo "--- LATEST SPEC: $(basename "$LATEST_SPEC") ---"
  cat "$LATEST_SPEC"
  echo ""
fi

# Latest plan
LATEST_PLAN=$(ls -t "$PROJECT_DIR/docs/superpowers/plans/"*.md 2>/dev/null | head -1)
if [ -n "$LATEST_PLAN" ]; then
  echo "--- LATEST PLAN: $(basename "$LATEST_PLAN") ---"
  cat "$LATEST_PLAN"
  echo ""
fi

# Recent git history
echo "--- RECENT GIT HISTORY ---"
cd "$PROJECT_DIR" && git log --oneline -10 2>/dev/null || echo "(no git history)"
echo ""

echo "=== END SESSION CONTEXT ==="
