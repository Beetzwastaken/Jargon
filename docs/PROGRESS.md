# Jargon — Progress Log

## 2026-04-01 — Duo Mode Redesign: Spec, Plan, Implementation

### What we did
- Full project review of all source files
- Brainstormed duo mode redesign (~15 clarifying questions)
- Wrote design spec: `docs/superpowers/specs/2026-04-01-duo-mode-redesign.md`
- Wrote implementation plan: `docs/superpowers/plans/2026-04-01-duo-mode-redesign.md`
- Set up session hooks (auto-load context on start, remind to update progress on stop)
- **Implemented all 17 tasks** via subagent-driven development
- E2E tested full game flow via API (all passing)
- Found and fixed 1 bug: `partner_joined` WS message missing `isMyTurnToPick`

### Key decisions
- **Scoring:** Your score = partner's line squares YOU marked (hunting their line)
- **Hybrid rebuild:** Keep networking layer (WebSocket, polling, API client). Rebuild game logic (worker.js Durable Object + duoStore).
- **SQLite in Durable Object** instead of JSON blob
- **Sequential line picking** — alternating who goes first (even UTC date = host, odd = partner)
- **Marks shared** — one per square, attributed to marker, only marker can unmark
- **Hit discovery** — haptic + score animates when you hit opponent's line. Board doesn't label it.
- **Partner's line hidden** until game ends (BINGO or UTC midnight)
- **BINGO = score 5** → immediate game over, both lines revealed, countdown to next card
- **Share card** — Wordle-style emoji grid (🟦🟧🟪⬜), copyable
- **Pairing persists** across days
- **Solo mode** built but hidden at launch, UTC

### Branch: `duo-mode-redesign` (5 commits ahead of main)
```
10c328c fix: send isMyTurnToPick in partner_joined broadcast
f4cdc28 rebuild frontend: duoStore, connectionStore, components for duo redesign
8d5d8ec rebuild BingoRoom: SQLite, sequential picks, attributed marks, scoring, snapshots
e2b3daf switch daily card seed to UTC, drop timezone params
0741ca5 add duo mode redesign spec, plan, session hooks, progress log
```

### E2E API test results (all passing)
- Create/join pairing ✓
- Sequential turn-based line picking ✓
- Turn enforcement + line conflict rejection ✓
- Attributed marks with hit detection ✓
- Toggle/unmark (only original marker) ✓
- BINGO at score 5 → game over ✓
- Finished phase reveals partner line ✓

### Next session
- **Visual browser testing** — start wrangler dev + vite, test full UI flow in two tabs
- Verify: mark colors, line indicators, scoreboard, game over screen, share card, countdown
- Fix any UI issues found
- Merge to main, push, deploy to production
- Update memory + PROGRESS.md
