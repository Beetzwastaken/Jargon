# Duo Mode Redesign — Design Spec

**Date:** 2026-04-01
**Status:** Draft
**Scope:** Duo mode only. Solo mode hidden at launch (built, not visible). Analytics untouched.

---

## What Jargon Is

Daily corporate buzzword bingo played during real meetings. Battleship meets Wordle. Two players pair up, each secretly bets on which line of buzzwords will be spoken most, then marks buzzwords they hear throughout their workday. Players do NOT need the same meeting — different companies, different timezones.

---

## Core Game Mechanic

### Scoring

**Your score = how many of your partner's secret line squares YOU marked.**

- You fire shots (mark squares you hear in meetings)
- You score when your shots land on their hidden line
- They score when their shots land on your hidden line
- Marking broadly is incentivized — any square could be on their line
- Score range: 0–5 per player
- BINGO = you marked all 5 of partner's line → early win, game ends immediately

### What You See During Play

- **Your marks** — your color
- **Partner's marks** — their color
- **Your line** — subtle visual indicator on your 5 squares
- **Partner's line** — hidden until game ends
- **Hit feedback** — when you mark a square on partner's line, you get subtle haptic + your score animates up. You know THAT square was a hit. Board doesn't label it or draw their line.
- **Both scores** — visible at all times: "You: X | Partner: Y"

### What You Don't See

- Partner's line (until game ends)
- Your partner already knows their own line, so your marks landing on it aren't secret to them

---

## State Machine

```
unpaired → waiting → selecting → playing → finished
                                    ↑          |
                                    +----------+
                                  (UTC midnight)
```

- **unpaired** — no room
- **waiting** — host created room, waiting for partner to join
- **selecting** — sequential line picking (see below)
- **playing** — marking phase, active until BINGO or UTC midnight
- **finished** — game over. Snapshot visible. Countdown to next card. Auto-transitions to `selecting` at UTC midnight.

---

## Daily Card

- Seeded PRNG (Mulberry32) + Fisher-Yates shuffle from 172 buzzword phrases
- Seed = **UTC date** (YYYY-MM-DD)
- Same date = same 25 phrases globally
- Resets at **UTC midnight (00:00:00 UTC)**
- Solo mode also switches to UTC

---

## Game Flow

### 1. Pairing

- Player A creates room → gets 4-char code
- Shares code externally (text, Slack, etc.)
- Player B joins with code
- Pairing persists across days — same room, same partner, new card daily
- Leave button always available for either player

### 2. Line Selection (Sequential)

- Alternating pick order based on UTC date seed: even date = host first, odd = partner first
- First picker selects from 12 lines (5 rows, 5 cols, 2 diags)
- Second picker sees "your turn to pick" then selects from remaining 11
- No conflicts possible — sequential eliminates collision
- Neither player sees the other's pick
- Both must select before marking begins

### 3. Marking Phase

- Active from both lines locked until BINGO or UTC midnight
- Tap square to mark, tap again to unmark (toggleable for misclicks)
- Only the player who marked a square can unmark it
- Marks attributed to the player who made them
- Once marked by one player, the other cannot also mark it — marks are shared, one mark per square
- Both players see all marks in real-time with color attribution
- Server is source of truth for scoring
- Client marks optimistically, server returns updated scores

### 4. Hit Discovery

- When you mark a square: server responds with `hit: true/false`
- If hit: subtle haptic feedback + score counter animates
- You know that specific square was on partner's line
- Board does NOT label it or draw their line — you piece it together mentally
- Partner can see your mark land on their known line (they picked it, they know)

### 5. BINGO (Early Win)

- Triggered when a player's score reaches 5 (all partner's line squares marked by them)
- Game immediately ends → phase = `finished`
- Both lines revealed
- Results screen: final score, winner, both lines shown on board
- Countdown timer to next card (UTC midnight)

### 6. End of Day (UTC Midnight)

- If no BINGO: game ends, snapshot stored, phase → `finished` briefly then → `selecting`
- If BINGO already happened: just transition to new day
- New card from new UTC date seed
- Previous day's snapshot available
- If partner has left, transitions to `waiting` instead of `selecting`

---

## Yesterday's Snapshot

### In-App View

- Full 5x5 board with actual buzzword phrases visible
- Both lines highlighted
- Color-coded marks showing who marked what
- Final score + winner
- Share button
- Dismissable — tap to go to today's game
- Shows on app open if yesterday has a result
- Also accessible via "Yesterday" button during today's game

### Share Card (Clipboard)

Wordle-style emoji grid, copyable as text:

```
Jargon — Apr 1
4 – 2 🏆

🟦🟦⬜⬜🟦
⬜🟧⬜🟧⬜
⬜⬜🟪⬜⬜
⬜🟧⬜⬜⬜
🟦⬜⬜⬜🟦

playjargon.com
```

Colors:
- 🟦 your line square (marked)
- 🟧 partner's line square (marked)
- 🟪 overlap square (on both lines, marked)
- ⬜ everything else

Exact visual treatment for making lines distinct (enlarged squares, etc.) — determined during implementation.

---

## Backend Architecture

### Approach: Hybrid Rebuild

**Keep:** WebSocket client, polling fallback, API client, connectionStore pattern, daily card generation, config, CORS, Worker routing shell.

**Rebuild from scratch:** Durable Object game logic, room state, scoring, message protocol.

### Room State (SQLite)

Use the Durable Object's SQLite storage (already provisioned in wrangler.toml) instead of a single JSON blob.

**`room` table:**
- code, host_id, host_name, partner_id, partner_name
- phase (waiting/selecting/playing/finished)
- host_line, partner_line (JSON)
- host_first_pick (boolean, derived from UTC date seed)
- daily_seed (YYYY-MM-DD, UTC)
- created_at, last_activity

**`marks` table:**
- index (0-24)
- marked_by (player_id)
- marked_at (timestamp)

**`snapshot` table:**
- date (YYYY-MM-DD)
- host_score, partner_score
- winner (host/partner/tie)
- host_line, partner_line (JSON)
- marks (JSON — full mark history for replay)

### Score Computation

Scores computed on read, not stored:
- My score = count of marks WHERE `marked_by = me` AND `index IN partner_line_indices`
- Toggle (unmark) = delete from marks table
- BINGO = score reaches 5

### API Endpoints

- `POST /api/duo/create` — create room (keep)
- `POST /api/duo/join` — join room (keep)
- `POST /api/duo/:code/select` — select line, enforces turn order
- `POST /api/duo/:code/mark` — toggle mark. Returns `{ hit: boolean, myScore, partnerScore, gameOver }`
- `GET /api/duo/:code/state` — player-aware. Hides partner line until finished.
- `GET /api/duo/:code/snapshot` — yesterday's result
- `POST /api/duo/:code/leave` — leave room (keep)

### WebSocket Protocol

**New/changed messages:**
- `square_marked { index, markedBy, hostScore, partnerScore }` — mark placed
- `square_unmarked { index, hostScore, partnerScore }` — mark removed
- `your_turn_to_pick {}` — sent to second picker
- `both_selected {}` — phase → playing
- `game_over { winner, hostScore, partnerScore, hostLine, partnerLine }` — BINGO or midnight

**Keep:** `connected`, `partner_joined`, `partner_left`, `daily_reset`, `ping`, `pong`

**Drop:** `card_revealed`, `line_conflict`, `partner_selected` (replaced by `your_turn_to_pick`)

---

## Frontend Architecture

### Keep As-Is

- `src/lib/websocket.ts` — WebSocket client
- `src/lib/polling.ts` — polling fallback
- `src/lib/api.ts` — generic request handler (update signatures)
- `src/lib/config.ts` — URL config
- `src/lib/dailyCard.ts` — card generation (switch to UTC)
- `src/stores/connectionStore.ts` — connection pattern (update handlers)

### Rebuild

- `src/stores/duoStore.ts` — new state shape, server-authoritative scoring, new phases
- `src/components/bingo/BingoCard.tsx` — color-coded marks, line indicator, hit animation
- `src/components/bingo/DuoScoreboard.tsx` — live scores, game over state
- `src/components/bingo/LineSelector.tsx` — sequential turn-based UI

### New Components

- `src/components/bingo/GameOverScreen.tsx` — results, revealed lines, countdown, share button
- `src/components/bingo/ShareCard.tsx` — emoji grid generation + clipboard copy
- `src/components/bingo/YesterdaySnapshot.tsx` — previous day result with full board

### DuoStore State Shape

```typescript
interface DuoState {
  // Pairing
  pairCode: string | null
  odId: string | null
  odName: string | null
  partnerId: string | null
  partnerName: string | null
  isPaired: boolean
  isHost: boolean

  // Phase
  phase: 'unpaired' | 'waiting' | 'selecting' | 'playing' | 'finished'

  // Picking
  myLine: LineSelection | null
  isMyTurnToPick: boolean
  partnerHasSelected: boolean

  // Card
  dailyCard: BingoSquare[]
  dailySeed: string // UTC

  // Marks (attributed)
  marks: Map<number, string> // index → playerId

  // Scores (server-authoritative)
  myScore: number
  partnerScore: number

  // Game over
  gameOver: boolean
  winner: 'me' | 'partner' | 'tie' | null
  partnerLine: LineSelection | null // only populated in finished phase

  // Yesterday
  snapshot: YesterdaySnapshot | null
}
```

Client never computes scores. Marks optimistically, server returns truth.

---

## Scope Boundaries

### In Scope

- Duo mode redesign (everything above)
- UTC date migration (duo + solo)
- Share card + snapshot
- Solo mode built but hidden (not visible at launch)

### Out of Scope

- Solo mode visibility/launch
- Analytics worker
- OG meta tags / social sharing images
- Tutorial/onboarding rewrite
- Mobile QA pass
- Logo/branding
- Whether solo mode is daily-locked or unlimited

---

## Open Questions

None — all resolved during brainstorming.
