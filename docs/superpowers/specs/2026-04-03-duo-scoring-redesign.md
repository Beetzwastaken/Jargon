# Duo Scoring Redesign

> Add bingo line bonuses and points-based fallback to existing duo mode.

## Problem

Players complete bingo lines and nothing happens because it wasn't their opponent's secret line. Lines should matter.

## Terminology

- **Your line / opponent's line** — the secretly picked row/col/diagonal
- **Bingo** — completing any row/col/diagonal (+3 points)
- **Bonus bingo** — completing opponent's secret line (instant win)

## Scoring

| Action | Points |
|--------|--------|
| Mark a square | +1 |
| Bingo (any line) | +3 |
| Bonus bingo (opponent's line) | Instant win |

Score = `markedSquares + (completedLines × 3)`

## Game End — Two Paths

1. **Bonus bingo** — complete opponent's secret line → instant win. Same as current BINGO behavior.
2. **No bonus bingo by midnight** — highest score wins. Tiebreaker: more bingos. Still tied: draw.

## What Stays the Same

- Pairing, room codes, WebSocket sync, polling fallback
- Each player secretly picks one line (row/col/diagonal)
- Sequential turn order for line picking (even UTC date = host first)
- Daily seeded card (same 25 words for everyone)
- Marks shared and attributed, only marker can unmark
- Share card at game end

## What Changes

### Backend (worker.js)

**Score computation:**
- Current: count of marks on opponent's line indices (0-5)
- New: `markedSquares + (completedLines × 3)`
- Computed server-side on each mark/unmark

**Bingo line detection:**
- After each mark/unmark, check all 12 possible lines (5 rows, 5 cols, 2 diagonals)
- Count how many lines the marking player has fully completed
- A line is complete when all 5 squares are marked (by either player — marks are shared)

**Bonus bingo check:**
- Same as current BINGO check — if all 5 squares in opponent's secret line are marked, instant win
- Rename internal references from `bingo` to `bonus_bingo` for clarity

**Midnight reset:**
- If no bonus bingo occurred, compare scores to determine winner
- Save winner + score breakdown in snapshot before reset

**API response changes:**
- `GET /duo/:code/state` — score is now a number (not X/5), include `completedLines` count per player
- `POST /duo/:code/mark` — response includes updated scores, flag if a new bingo was completed
- `game_over` WebSocket message — include score breakdown

### Frontend

**Score display (DuoScoreboard):**
- Current: X/5 progress toward opponent's line
- New: total points per player

**Bingo celebration:**
- When a mark completes any line → visual animation/highlight on the completed line
- Distinct from bonus bingo (which ends the game)

**Game over screen:**
- Bonus bingo: same as current, winner announced
- Midnight (no bonus bingo): show score breakdown — "12 marks + 9 bingo = 21 pts"
- Show winner or draw

**Terminology updates:**
- "BINGO!" win announcement → "Bonus Bingo!"
- Score labels reflect points, not progress

### Store Changes (duoStore)

- Score type: number (not X/5 fraction)
- Add `completedLines: number` per player
- Add bingo line detection for client-side animations
- Bonus bingo still triggers game-over flow

## Migration

- No backward compatibility needed (daily reset clears everything)
- Ship as breaking change — existing rooms at deploy time may break, midnight reset fixes it
- Deploy during low-activity window or just deploy
