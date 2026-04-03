# Duo Scoring Redesign — Test Plan

> Comprehensive testing for the scoring redesign: unit tests, API integration tests, and Playwright E2E.

## Part 1: Unit Tests (Vitest)

### Frontend helpers (`src/lib/dailyCard.ts`)

**`countCompletedLines(markedIndices)`:**
- Empty array → 0
- 4 squares in a row (incomplete) → 0
- 5 squares completing row 0 (indices 0-4) → 1
- 10 squares completing row 0 + row 1 → 2
- Row + col sharing a square (e.g., row 0 + col 0) → 2
- All 25 squares → 12

**`getCompletedLineIndices(markedIndices)`:**
- No completed lines → empty array
- One completed row → returns that row's 5 indices
- Two completed lines → returns both index arrays
- Diagonal 0 (0,6,12,18,24) → returns those indices

### Store logic (`src/stores/duoStore.ts`)

**`handleGameOver`:**
- With `bonusBingo: true` → state.bonusBingo = true, winner mapped correctly
- With `bonusBingo: false` → state.bonusBingo = false
- Tie → winner = 'tie'

**`handleDailyReset`:**
- Resets bonusBingo to false, scores to 0

## Part 2: API Integration Tests (against local wrangler dev)

### Scoring math

| Scenario | Marks | Expected Score |
|----------|-------|---------------|
| 1 square marked | 1 | 1 |
| 5 squares, no line | 5 | 5 |
| 5 squares = 1 row | 5 | 8 (5+3) |
| Row + col sharing corner | 9 | 15 (9+6) |
| Unmark breaks a line | 4 | 4 (lost mark + line bonus) |
| All 25 squares | 25 | 61 (25+36) |

### Bonus bingo

- Complete opponent's secret line → response `gameOver: true, bonusBingo: true`
- Complete any other line → response `gameOver: false`
- Opponent's line completed by shared marks (both players) → still triggers bonus bingo
- game_over WebSocket broadcast includes `bonusBingo: true`, both lines, winner role

### No bonus bingo (midnight/daily reset)

- Game in playing phase, no bonus bingo → daily reset snapshot has score-based winner
- Tied scores → snapshot winner = null
- One player has bonus bingo at reset → that player wins

### Edge cases

- Toggle (unmark + remark) → scores recalculate correctly each time
- Unmark when no lines complete → score = mark count only
- Mark square already marked by partner → error (existing behavior, shouldn't break)

## Part 3: Playwright E2E (two browser tabs)

### Flow 1: Bonus bingo win
1. Host creates room, partner joins with code
2. Both pick secret lines (sequential turns)
3. Mark all 5 squares in opponent's secret line
4. Verify: game_over screen shows "Bonus Bingo! You win!" / "Bonus Bingo! [name] wins!"
5. Verify: scores show as points with "pts" suffix, not X/5

### Flow 2: Bingo line scoring (no bonus bingo)
1. Both paired and in playing phase
2. Mark 5 squares to complete a row that is NOT opponent's secret line
3. Verify: score jumps by +3 (before: N marks = N pts, after: N marks = N+3 pts)
4. Verify: game does NOT end
5. Verify: completed line squares have accent ring highlight

### Flow 3: UI verification
1. Scoreboard shows bare point numbers (no "/5")
2. Scoring info text: "+1 per mark · +3 per bingo line · Bonus bingo = instant win"
3. Secret line squares: `ring-j-me/40` during play
4. Completed bingo line squares: `ring-j-accent/50` during play
5. If square is in both secret line AND completed line → secret line ring takes priority

### Flow 4: Unmark regression
1. Complete a bingo line → verify score includes +3 and highlight shows
2. Unmark one square from that line
3. Verify: score drops (lost 1 mark + 3 line bonus = -4)
4. Verify: accent ring highlight disappears from those squares
