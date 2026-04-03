# Jargon

> Buzzword bingo you play during real meetings. Tap words as you hear them, score points, hunt your opponent's secret line.

## Quick Reference

| Item | Value |
|------|-------|
| **Version** | v2.1.0 |
| **Frontend URL** | https://playjargon.com |
| **Backend URL** | https://api.playjargon.com |
| **Deploy** | Auto on push to main (Netlify + Cloudflare Workers) |

## Project Docs

| Doc | Purpose |
|-----|---------|
| `docs/PROGRESS.md` | Session journal — what was done, decisions made, what's next |
| `docs/superpowers/specs/` | Design specs |
| `docs/superpowers/plans/` | Implementation plans |

Session hooks auto-load these on startup. See `.claude/settings.json`.

---

## Game Modes

### Solo
- Random card, mark squares during any meeting, track score
- Pure client-side, no backend needed
- **Status**: Built — toggleable squares, undoable bingo, persistent score

### Duo
- 2 players pair up in same meeting, share daily card
- Each secretly picks a line (row/col/diagonal)
- Score = your marks (+1 each) + bingo lines you complete (+3 each)
- **Bonus bingo** = completing opponent's secret line = instant win
- No bonus bingo by midnight → highest score wins
- WebSocket sync with HTTP polling fallback
- **Status**: Built, deployed, tested (32 tests)

### Duo Scoring

| Action | Points |
|--------|--------|
| Mark a square | +1 |
| Complete any bingo line (your marks only) | +3 |
| Complete opponent's secret line (bonus bingo) | Instant win |

### Duo Flow
1. **Unpaired** → Enter name, create room OR join with 4-char code
2. **Waiting** → Host shares code with partner
3. **Selecting** → Both secretly pick a line
4. **Playing** → Mark squares, score points, hunt opponent's line
5. **Finished** → Bonus bingo (instant) or midnight (highest score wins)

### Daily Card
- Seeded PRNG (Mulberry32) + Fisher-Yates shuffle
- Same date → same 25 phrases globally
- Resets at UTC midnight

---

## Architecture

### Stores (Zustand + persist)

| Store | Purpose |
|-------|---------|
| `duoStore` | Pairing, lines, scores, bonusBingo, game state |
| `connectionStore` | WebSocket/polling, routes messages |
| `soloStore` | Solo mode state + localStorage persist |

### Backend (worker.js)

Cloudflare Worker + Durable Objects. Duo API:
```
POST /api/duo/create, /join, /:code/select, /:code/mark, /:code/leave
GET  /api/duo/:code/state, /:code/ws
```

Key backend functions:
- `computeScore(playerId)` — marks + completedLines × 3 (per-player)
- `checkBonusBingo(playerId)` — all 5 squares of opponent's line marked
- `countCompletedLines(marks, playerId)` — bingo lines from this player's marks only

WebSocket messages: `connected`, `partner_joined`, `partner_left`, `partner_selected`, `line_conflict`, `card_revealed`, `square_marked`, `square_unmarked`, `game_over`, `daily_reset`

---

## Testing

```bash
npm test                              # Unit tests (Vitest, jsdom)
npx vitest run --config vitest.config.api.ts  # API integration tests (node, hits live worker)
```

- 13 unit tests: `countCompletedLines`, `getCompletedLineIndices`
- 10 unit tests: `duoStore.handleGameOver`, `handleDailyReset`
- 9 API tests: scoring math, bonus bingo, shared marks, toggle

---

## Development

```bash
npm run dev       # Frontend (port 5175)
npm run build     # Production build
npm test          # Vitest
npx wrangler dev  # Local backend
npx wrangler deploy  # Deploy backend
```

### Custom Skills
- `/deploy` — Lint, test, build, deploy worker + push to GitHub in one command. See `.claude/skills/deploy/SKILL.md`.

---

## Tech Stack

React 19, TypeScript, Vite, Tailwind, Zustand, Cloudflare Workers + Durable Objects, Netlify

---

*Updated: April 3, 2026 | Scoring redesign: bingo lines + bonus bingo*
