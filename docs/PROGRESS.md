# Jargon — Progress Log

## 2026-04-07 — Battleship Mode + Rebrand

### What we did
- **Replaced bingo line selection with battleship mechanics** — each player hides 5 individual squares instead of picking a line
- Scoring is now hits-based: mark opponent's hidden square = hit. 5/5 hits = instant win. Midnight fallback = most hits, tiebreaker = most marks.
- Selection is simultaneous (both pick at same time, no turn order)
- Marking your own hidden square doesn't count as a hit against you
- **New tagline:** "your meetings needed a point. here's one."
- Removed all "buzzword bingo" branding from user-facing text
- Disabled solo mode (code still exists, button hidden)
- Rewrote tutorial for duo-only battleship flow (3 steps: welcome, how it works, winning)
- Fixed join link (`?join=CODE`) — now goes directly to join form with code pre-filled
- Fixed mobile header — `fixed` positioning so it stays pinned while scrolling
- Dimmed non-hit marks in finished phase so hits visually pop
- Curated buzzword list: removed 7 (Resource Allocation, Can You See My Screen, Touch Points, Disrupt, Pivot, Thought Leader, Ecosystem), renamed AI-powered → AI. 149 → 142 phrases.
- Full visual testing via Playwright: home → create → select → play → hit → instant win → share card
- 79 unit tests passing, build clean

### Key commits
```
306181b backend: replace bingo lines w/ battleship squares selection + hit scoring
bb9cc7f backend: battleship mark/state/snapshot/reset + remove bingo line logic
11c822c frontend types: replace line selection w/ squares, scores w/ hits
845d1b2 frontend stores: battleship squares selection + hit tracking
e3894d4 replace LineSelector w/ SquareSelector for battleship 5-square placement
85dff8a BingoCard: battleship hit styling, hidden square indicators
30300a3 scoreboard/gameover/share: hits-based display for battleship mode
faf20c4 App.tsx: wire up battleship square selection + hit display
734a104 rebrand: "your meetings needed a point. here's one."
718e6f4 disable solo mode, rewrite tutorial for duo-only battleship
1fbe54e fix: join link pre-fills code + sticky header on mobile
694680e dim non-hit marks in finished phase so hits stand out
```

### Key files changed
- `worker.js` — schema (host_squares/partner_squares/host_ready/partner_ready), selectSquares, computeHits, checkAllHit, hit-based mark/state/snapshot/reset
- `src/stores/duoStore.ts` — mySquares/partnerSquares/myHits/partnerHits/allHit/myReady/partnerReady
- `src/stores/connectionStore.ts` — partner_ready message, hit-based score mapping
- `src/components/bingo/LineSelector.tsx` — rewritten as SquareSelector (tap 5 squares, lock in)
- `src/components/bingo/BingoCard.tsx` — hidden square indicators, hit styling, dimmed non-hits
- `src/components/bingo/DuoScoreboard.tsx` — X/5 hit counters
- `src/components/bingo/GameOverScreen.tsx` — "All 5 sunk!" win text, hits display
- `src/components/bingo/ShareCard.tsx` — emoji grid with 🟦🟧💥🟪
- `src/components/ModeSelector.tsx` — solo button removed, new tagline
- `src/components/shared/WelcomeTutorial.tsx` — duo-only 3-step tutorial
- `src/components/bingo/RoomManager.tsx` — accepts initialJoinCode prop
- `src/App.tsx` — fixed header, join code passthrough, battleship wiring
- `index.html`, `manifest.json`, `README.md`, `CLAUDE.md` — rebrand

### Next session
- Real phone testing (iOS Safari, Android Chrome)
- Hit animation — "something cool" when you land a hit (spec calls for it, not yet built)
- Consider: demotivational sayings per square (friend's idea from Discord)
- Consider: productivity meter / meeting cost calculator
- Rewrite API integration tests for battleship (currently stale)

---

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
- ~~Visual browser testing~~ Done 2026-04-02
- ~~Fix any UI issues found~~ Done 2026-04-02
- ~~Merge to main, push, deploy~~ Done 2026-04-02

---

## 2026-04-02 — Bug Fixes, UI Redesign, Logo

### What we did
- Visual browser tested full duo flow (Playwright, two tabs)
- Found and fixed 3 bugs:
  - `getState` marks field `idx` → `index` (partner marks not rendering)
  - `game_over` winner: sent player name, frontend expected `host`/`partner` role
  - Final BINGO-triggering mark not broadcast before `game_over`
  - Bonus: `handleSquareUnmarked` now filters by `markedBy`
- URL rebranding: `corporate-bingo-ai.netlify.app` → `playjargon.com`
- **Full UI redesign — "Corporate Satire" theme:**
  - Fonts: Sora (display) + Space Mono (bingo squares)
  - Palette: warm amber/gold (#d4a04a) on deep charcoal, replacing generic purple
  - Player colors: refined teal (#4a9ead) + warm orange (#c67a3c)
  - New logo: gold J with ghost 5x5 bingo grid overlay, grain texture
  - All components migrated from `apple-*` to `j-*` design tokens
  - Tutorial rewritten (removed Solo references)
  - Solo mode hidden from UI
- Merged `duo-mode-redesign` → main, deployed

### Commits on main
```
be36210 redesign: Corporate Satire theme, new logo, hide solo mode
8874bc6 fix: partner marks not rendering, winner text inverted, BINGO mark missing
b49729c rebrand URLs: corporate-bingo-ai.netlify.app → playjargon.com
```

### Next session
- ~~Polish pass~~ Done later in session

---

## 2026-04-02 (cont.) — Solo fixes, UI polish, buzzword curation, gameplay redesign spec

### What we did
- Re-enabled solo mode for UI testing
- Fixed solo scoring bugs:
  - Bingo bonus awarded repeatedly → now exactly once via `bingoAwarded` flag
  - Board locked after bingo → removed, players can keep marking
  - Score derived from marked count, not incremental (prevents manipulation)
- Fixed bingo modal cutoff on mobile (overflow from `left-1/2 translate` → `inset-x-0`)
- Fixed shuffle new card not working (seed passed as string to date parser → added `generateRandomCard` with numeric seed, fixed `initializeCard` clobbering shuffled cards)
- Scrubbed ALL remaining off-brand colors (toasts, error boundary, connection indicator)
- Updated tutorial to mention both Solo and Duo
- Removed legacy cyan CSS mappings
- Curated buzzword list: 172 → 151 phrases
  - Removed generic/redundant/dated terms
  - Added bracket notation for observable moments: `[Heavy Breathing Into Mic]`
  - Added 11 new phrases
  - Deleted stale `buzzwords.js` (Vite was importing it over `.ts`)
- Fixed worker importing `buzzwords.js` instead of `.ts`
- Redesigned line selector: two-tap on grid + confirm button (replaced text buttons)
- Removed version display from header
- Removed BINGO header from card
- Logo: embedded Sora font as inline React SVG component (guaranteed font match)
- Player colors: host always teal, partner always amber (role-based, not perspective-based)
- Fixed partner stuck on "waiting" when host leaves (full reset to unpaired)
- Service worker: bumped cache version, force update on page load, fixed Netlify cache headers
- CSP updated for Google Fonts
- Netlify: hashed assets set to immutable, sw.js set to no-cache
- Added GitHub Action for auto-deploying worker on push to main
- **Brainstormed duo gameplay redesign:**
  - Traditional bingo lines now award +3 points
  - Pick 5 secret squares (anywhere) instead of a line
  - +2 per opponent hit on your secrets
  - +1 per square marked
  - Game runs until UTC midnight, most points wins
  - Spec written: `docs/superpowers/specs/2026-04-02-duo-gameplay-redesign.md`

### Next session
- Review gameplay redesign spec
- Write implementation plan (invoke writing-plans skill)
- ~~Implement the redesign~~ Done 2026-04-03
- Add Cloudflare API token to GitHub secrets for auto-deploy
- Test on real phones (iOS Safari, Android Chrome)
- Share card visual testing
- Consider: onboarding flow improvements, haptic feedback on mobile

---

## 2026-04-03 — Scoring Redesign: Bingo Lines + Points Fallback

### What we did
- Rejected previous complex redesign (5 secret squares, 3 scoring sources)
- Designed simpler alternative: keep secret line, add bingo line bonuses
- **New terminology:** "bingo" = any line complete (+3), "bonus bingo" = opponent's line (instant win)
- **New scoring:** score = your marks + (your completed bingo lines × 3)
- **New game end:** bonus bingo = instant win, no bonus bingo by midnight = highest score wins
- Wrote spec + plan, implemented via subagent-driven development (12 tasks)
- **Bug found during E2E testing:** both players got +3 for lines completed by either player. Fixed — only YOUR marks count for line bonuses.
- Comprehensive test suite: 13 unit tests (dailyCard), 10 unit tests (duoStore), 9 API integration tests
- All 32 tests passing, deployed to production

### Key files changed
- `worker.js` — `computeScore`, `checkBonusBingo`, `countCompletedLines` (per-player), mark/state/reset handlers
- `src/lib/dailyCard.ts` — `ALL_LINES`, `countCompletedLines`, `getCompletedLineIndices`
- `src/stores/duoStore.ts` — `bonusBingo` state
- `src/stores/connectionStore.ts` — pass `bonusBingo` to handlers
- `src/components/bingo/DuoScoreboard.tsx` — points display, scoring info
- `src/components/bingo/GameOverScreen.tsx` — "Bonus Bingo!" text, pts suffix
- `src/components/bingo/BingoCard.tsx` — completed line highlighting (your marks only)
- `src/lib/api.ts` — removed `hit`, added `bonusBingo`

### Next session
- Add Cloudflare API token to GitHub secrets for auto-deploy
- Test on real phones (iOS Safari, Android Chrome)
- Visual testing: share card, game over screen
- Update CLAUDE.md project docs with new scoring terminology
- Consider: tutorial update for new scoring, haptic feedback
