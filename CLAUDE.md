# Jargon

> Buzzword bingo you play during real meetings. Tap words as you hear them, hunt your opponent's hidden squares.

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
- Each secretly hides 5 squares on the board
- Both mark squares simultaneously as buzzwords are heard
- Score = hits on opponent's hidden squares
- **All hit** = hitting all 5 of opponent's hidden squares = instant win
- No all-hit by midnight → most hits wins, tiebreaker = most marks
- WebSocket sync with HTTP polling fallback
- **Status**: Built, deployed, tested (32 tests)

### Duo Scoring

| Action | Result |
|--------|--------|
| Mark a square that is one of opponent's hidden squares | +1 hit |
| Hit all 5 of opponent's hidden squares | Instant win |
| Midnight, no all-hit | Most hits wins (tiebreaker: most marks) |

### Duo Flow
1. **Unpaired** → Enter name, create room OR join with 4-char code
2. **Waiting** → Host shares code with partner
3. **Selecting** → Both simultaneously select 5 hidden squares
4. **Playing** → Mark squares, accumulate hits on opponent's hidden squares
5. **Finished** → All-hit (instant) or midnight (most hits wins)

### Daily Card
- Seeded PRNG (Mulberry32) + Fisher-Yates shuffle
- Same date → same 25 phrases globally
- Resets at UTC midnight

---

## Architecture

### Stores (Zustand + persist)

| Store | Purpose |
|-------|---------|
| `duoStore` | Pairing, hidden squares, hits, allHit, game state |
| `connectionStore` | WebSocket/polling, routes messages |
| `soloStore` | Solo mode state + localStorage persist |

### Backend (worker.js)

Cloudflare Worker + Durable Objects. Duo API:
```
POST /api/duo/create, /join, /:code/select, /:code/mark, /:code/leave
GET  /api/duo/:code/state, /:code/ws
```

Key backend functions:
- `computeHits(playerId)` — count of marks landing on opponent's hidden squares
- `checkAllHit(playerId)` — true if all 5 of opponent's hidden squares are marked
- `selectSquares(playerId, squares)` — store player's 5 hidden squares

WebSocket messages: `connected`, `partner_joined`, `partner_left`, `partner_ready`, `both_selected` (both players have chosen hidden squares), `card_revealed`, `square_marked`, `square_unmarked`, `game_over` (includes `hits`, `allHit` fields), `daily_reset`

---

## Testing

```bash
npm test                              # Unit tests (Vitest, jsdom)
npx vitest run --config vitest.config.api.ts  # API integration tests (node, hits live worker)
```

- 13 unit tests: `countCompletedLines`, `getCompletedLineIndices`
- 10 unit tests: `duoStore.handleGameOver`, `handleDailyReset`
- 9 API tests: scoring math, all-hit, shared marks, toggle

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

*Updated: April 7, 2026 | Battleship mode: hidden squares + hits*
