# Jargon

> Buzzword bingo you play during real meetings. Tap words as you hear them, complete a line to win.

## Quick Reference

| Item | Value |
|------|-------|
| **Version** | v2.0.0 |
| **Frontend URL** | https://playjargon.com |
| **Backend URL** | https://api.playjargon.com |
| **Launch Target** | March 20, 2026 |

---

## Game Modes

### Solo
- Random card, mark squares during any meeting, track score
- Pure client-side, no backend needed
- **Status**: Built — toggleable squares, undoable bingo, persistent score

### Duo
- 2 players pair up in same meeting, share daily card
- Each secretly picks a line (row/col/diagonal), race to complete
- WebSocket sync with HTTP polling fallback
- **Status**: Built, needs end-to-end testing

### Duo Flow
1. **Unpaired** → Enter name, create room OR join with 4-char code
2. **Waiting** → Host shares code with partner
3. **Selecting** → Both secretly pick a line
4. **Playing** → Same card, mark squares as you hear them, race to BINGO

### Daily Card
- Seeded PRNG (Mulberry32) + Fisher-Yates shuffle
- Same date → same 25 phrases globally
- Resets at midnight user timezone

---

## Architecture

### Stores (Zustand + persist)

| Store | Purpose |
|-------|---------|
| `duoStore` | Pairing, lines, scores, game state |
| `connectionStore` | WebSocket/polling, routes messages |
| `soloStore` | Solo mode state + localStorage persist |

### Backend (worker.js)

Cloudflare Worker + Durable Objects. Duo API:
```
POST /api/duo/create, /join, /:code/select, /:code/mark, /:code/leave
GET  /api/duo/:code/state, /:code/ws
```

WebSocket messages: `connected`, `partner_joined`, `partner_left`, `partner_selected`, `line_conflict`, `card_revealed`, `square_marked`, `bingo`, `daily_reset`

---

## Development

```bash
npm run dev       # Frontend (port 5175)
npm run build     # Production build
npm test          # Vitest
npx wrangler dev  # Local backend
npx wrangler deploy  # Deploy backend
```

---

## Tech Stack

React 19, TypeScript, Vite, Tailwind, Zustand, Cloudflare Workers + Durable Objects, Netlify

---

*Updated: March 13, 2026 | Rebranded to Jargon*
