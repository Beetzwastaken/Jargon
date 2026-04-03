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
- Implement the redesign
- Add Cloudflare API token to GitHub secrets for auto-deploy
- Test on real phones (iOS Safari, Android Chrome)
- Share card visual testing
- Consider: onboarding flow improvements, haptic feedback on mobile
