# Jargon — Progress Log

## 2026-04-01 — Duo Mode Redesign Spec

### What we did
- Full project review of all source files
- Brainstormed duo mode redesign through ~15 clarifying questions
- Wrote design spec: `docs/superpowers/specs/2026-04-01-duo-mode-redesign.md`
- Set up session hooks (auto-load context on start, remind to update progress on stop)

### Key decisions
- **Scoring reversed from original spec:** Your score = partner's line squares YOU marked (not partner's marks on your line). You're hunting their line.
- **Hybrid rebuild approach:** Keep networking layer (WebSocket, polling, API client, connectionStore). Rebuild game logic from scratch (worker.js Durable Object, duoStore).
- **SQLite in Durable Object** instead of JSON blob for room state
- **Sequential line picking** — alternating who goes first based on UTC date seed (even=host, odd=partner). No conflicts.
- **Marks are shared** — one mark per square, attributed to marker. Only marker can unmark. Toggleable for misclicks.
- **Hit discovery** — when you mark a partner's line square, you get haptic + score animates. Board doesn't label their line, but you can infer from timing.
- **Partner's line hidden** until game ends (BINGO or UTC midnight)
- **Early win (BINGO)** — marking all 5 of partner's line = immediate game over
- **Post-game:** results screen + countdown to next card. Yesterday's snapshot available on next open.
- **Share card** — Wordle-style emoji grid, copyable to clipboard
- **Pairing persists** across days, leave button always available
- **Solo mode:** built but hidden at launch. UTC for now. Daily lock TBD.

### Current status
- Spec complete, not yet committed
- Implementation plan not yet created (next step)
- No code changes yet

### Next session
- Create implementation plan (writing-plans skill)
- Begin execution
