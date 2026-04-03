# Duo Mode Gameplay Redesign

> Replace secret-line hunting with traditional bingo + 5 secret bonus squares.

## Problem

Current system: each player picks a secret line, opponent scores by marking squares in that line, first to 5 wins. Confusing — players complete bingo lines and nothing happens because it's not their opponent's secret line.

## New Design

### Scoring Model

| Action | Points | Notes |
|--------|--------|-------|
| Mark a square | +1 | Any square you tap |
| Complete a bingo line | +3 | Any row, col, or diagonal. Multiple lines = multiple bonuses. |
| Opponent marks your secret square | +2 | Per hit. Max +10 from 5 secrets. |

### Game Flow

1. **Pair** — Create/join room with 4-char code. Same as today.
2. **Select 5 secret squares** — Each player taps 5 squares anywhere on the board. No restrictions on placement. Sequential turn order (alternating who picks first, based on UTC date seed — same as current line picking). Selections hidden from opponent.
3. **Play** — Both mark squares throughout the day as they hear buzzwords in meetings. Points accumulate in real time. Bingo lines (row/col/diagonal completions) award +3 instantly. Secret square hits award +2 to the player who placed them. Opponent does not know when they hit a secret square.
4. **Game end** — UTC midnight. Highest score wins. Both players' secret squares revealed on the board. Score breakdown shown (marks, bingo bonuses, secret hits).

### Secret Square Rules

- Pick any 5 squares. No restrictions (can be in a line, scattered, clustered — strategy is open).
- Your secret squares show a subtle ring indicator visible only to you during play.
- Opponent's secret squares are hidden until game end.
- When opponent marks one of your secrets, you get +2 silently (no notification to opponent).
- Your own score updates in real time so you can see it climbing.

### Win Condition

- Most total points at UTC midnight wins.
- Tie: player who completed more bingo lines wins. Still tied: draw.
- No instant game over. Game always runs the full day.

### What Changes

| Area | Current | New |
|------|---------|-----|
| Selection | Pick 1 line (row/col/diagonal) | Pick 5 individual squares |
| Selection UI | Two-tap line selector | Tap 5 squares + confirm |
| Win condition | First to score 5 on opponent's line | Most points at UTC midnight |
| Bingo lines | Irrelevant to scoring | +3 bonus each |
| Game end | Instant on BINGO (score=5) | Always at UTC midnight |
| Score display | X/5 progress | Total points |

### What Stays the Same

- Pairing, room codes, WebSocket sync, polling fallback
- Daily card seeded by UTC date
- Sequential selection turn order
- Game over screen with reveal + share card
- Mark attribution (who marked each square)
- Only marker can unmark their own square

## Backend Changes (worker.js)

### Database Schema

**Room table changes:**
- `host_line` → `host_squares` (JSON array of 5 indices)
- `partner_line` → `partner_squares` (JSON array of 5 indices)
- Remove BINGO=5 game over check
- Add bingo line detection for +3 bonus

**Score computation:**
- Current: count marks on opponent's line indices
- New: `markPoints + (bingoLines * 3) + (secretHits * 2)`
  - `markPoints` = count of squares this player marked
  - `bingoLines` = count of completed rows/cols/diagonals by this player
  - `secretHits` = count of opponent's secret squares this player marked

### API Changes

**`POST /duo/:code/select`**
- Current: `{ line: { type, index } }`
- New: `{ squares: [idx1, idx2, idx3, idx4, idx5] }`
- Validate: exactly 5 indices, all 0-24, no duplicates

**`POST /duo/:code/mark`**
- No longer triggers game over
- Response includes updated scores (computed server-side)
- Bingo detection: check all 12 lines after each mark

**`GET /duo/:code/state`**
- `hostLine`/`partnerLine` → `hostSquares`/`partnerSquares`
- Score is now a single number (not X/5)
- Include `bingoLines` count per player in response

### Game Over

- No instant game over on mark
- Daily reset at UTC midnight triggers final scoring
- Snapshot saved with score breakdown

## Frontend Changes

### Selection UI (LineSelector → SquareSelector)

- Rename component
- Player taps squares on the board to select them (up to 5)
- Tapped squares highlight with amber
- Counter shows "3/5 selected"
- Confirm button appears when 5 are selected
- Can tap a selected square to deselect before confirming

### Scoreboard (DuoScoreboard)

- Current: `X/5` progress bar style
- New: Total points for each player
- Optional: small breakdown tooltip (marks / bingos / secrets)

### BingoCard

- Detect and highlight completed bingo lines (visual flash/animation)
- Secret square ring indicator (same as current line indicator)
- Uses 5 arbitrary indices instead of `getLineIndices(line)`

### GameOverScreen

- Show both players' secret squares on board
- Score breakdown: "12 marks + 6 bingo + 4 secrets = 22 pts"
- Winner announcement

### Store Changes (duoStore)

- `myLine: LineSelection` → `mySquares: number[]`
- `partnerLine: LineSelection` → `partnerSquares: number[]`
- `selectLine()` → `selectSquares(indices: number[])`
- Score is a single number, not X/5
- Remove game-over-on-bingo logic
- Add bingo line detection client-side for animations

### Connection Store

- Update `BOTH_SELECTED` handler for new square format
- Update `SQUARE_MARKED` to not trigger game over
- Remove `GAME_OVER` from mark flow (game ends at daily reset only)

## Migration

- No backward compatibility needed (no persistent games across days)
- Ship as a breaking change — existing rooms at deploy time will break, but daily reset clears everything anyway
- Deploy during low-activity window or just deploy and let midnight reset fix it
