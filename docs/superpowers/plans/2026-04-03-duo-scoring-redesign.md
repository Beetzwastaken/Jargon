# Duo Scoring Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bingo line bonuses (+3 per completed line) and points-based fallback scoring to existing duo mode, while keeping bonus bingo (completing opponent's line) as an instant win.

**Architecture:** Modify `computeScore()` in worker.js to count marks + completed bingo lines × 3. Update daily reset to determine winner by score if no bonus bingo. Update frontend score display from X/5 to total points. Add client-side bingo line detection for animations.

**Tech Stack:** Cloudflare Workers (worker.js), React, TypeScript, Zustand, Vitest

---

### Task 1: Add `getAllLines` and `countCompletedLines` helpers to worker.js

**Files:**
- Modify: `worker.js:75-97` (after existing `getLineIndices`)

- [ ] **Step 1: Add `ALL_LINES` constant and `countCompletedLines` function after `getLineIndices`**

Add after the existing `getLineIndices` function (after line ~97):

```javascript
// All 12 possible bingo lines
const ALL_LINES = [
  { type: 'row', index: 0 }, { type: 'row', index: 1 }, { type: 'row', index: 2 },
  { type: 'row', index: 3 }, { type: 'row', index: 4 },
  { type: 'col', index: 0 }, { type: 'col', index: 1 }, { type: 'col', index: 2 },
  { type: 'col', index: 3 }, { type: 'col', index: 4 },
  { type: 'diag', index: 0 }, { type: 'diag', index: 1 }
];

// Count how many bingo lines are fully marked (by either player — marks are shared)
function countCompletedLines(marks) {
  const markedSet = new Set(marks.map(m => m.idx));
  let count = 0;
  for (const line of ALL_LINES) {
    const indices = getLineIndices(line);
    if (indices.every(idx => markedSet.has(idx))) {
      count++;
    }
  }
  return count;
}
```

- [ ] **Step 2: Commit**

```bash
git add worker.js
git commit -m "add countCompletedLines helper for bingo line detection"
```

---

### Task 2: Rewrite `computeScore` and `computeScores` in worker.js

**Files:**
- Modify: `worker.js:466-488` (`computeScore` and `computeScores`)

- [ ] **Step 1: Replace `computeScore` to return marks + bingo bonuses**

Replace lines 466-488 with:

```javascript
  computeScore(playerId, room) {
    // Score = squares this player marked + (completed bingo lines × 3)
    const marks = this.getMarks();
    const myMarks = marks.filter(m => m.marked_by === playerId).length;
    const completedLines = countCompletedLines(marks);
    return myMarks + (completedLines * 3);
  }

  // Check if player completed opponent's secret line (bonus bingo = instant win)
  checkBonusBingo(playerId, room) {
    const isHost = playerId === room.host_id;
    const opponentLine = isHost ? room.partner_line : room.host_line;
    if (!opponentLine) return false;
    const lineIndices = getLineIndices(opponentLine);
    const marks = this.getMarks();
    return lineIndices.every(idx => marks.some(m => m.idx === idx));
  }

  computeScores(room) {
    if (!room.host_line || !room.partner_line) return { hostScore: 0, partnerScore: 0 };
    return {
      hostScore: this.computeScore(room.host_id, room),
      partnerScore: this.computeScore(room.partner_id, room)
    };
  }
```

- [ ] **Step 2: Verify no other callers of `computeScore` depend on old behavior**

Run: `grep -n "computeScore\|checkBonusBingo" worker.js`

Callers: `computeScores()`, `markSquare()`, `getState()`, `performDailyReset()`. All use `computeScores()` which wraps `computeScore()` — safe.

- [ ] **Step 3: Commit**

```bash
git add worker.js
git commit -m "rewrite scoring: marks + bingo line bonuses, extract checkBonusBingo"
```

---

### Task 3: Update `markSquare` handler to use `checkBonusBingo`

**Files:**
- Modify: `worker.js:855-935` (mark handler after insert)

- [ ] **Step 1: Replace the hit detection and BINGO check block**

Replace lines 860-913 (from `// Determine if hit` through the game-over response) with:

```javascript
    // Check bonus bingo (completed opponent's secret line = instant win)
    const bonusBingo = this.checkBonusBingo(playerId, room);

    const scores = this.computeScores(room);
    const myScore = isHost ? scores.hostScore : scores.partnerScore;
    const partnerScoreVal = isHost ? scores.partnerScore : scores.hostScore;

    if (bonusBingo) {
      // Broadcast the final mark before game_over so partner sees it
      this.broadcastToRoom({
        type: 'square_marked',
        index,
        markedBy: playerId,
        hostScore: scores.hostScore,
        partnerScore: scores.partnerScore
      });

      this.updateRoom({ phase: 'finished', last_activity: Date.now() });

      // Store snapshot
      const winnerRole = isHost ? 'host' : 'partner';
      const allMarks = this.getMarks();
      this.sql.exec(
        `INSERT OR REPLACE INTO snapshots (date, host_id, host_name, partner_id, partner_name, host_score, partner_score, winner, host_line, partner_line, marks_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        room.daily_seed, room.host_id, room.host_name, room.partner_id, room.partner_name,
        scores.hostScore, scores.partnerScore, isHost ? room.host_name : room.partner_name,
        JSON.stringify(room.host_line), JSON.stringify(room.partner_line),
        JSON.stringify(allMarks)
      );

      this.broadcastToRoom({
        type: 'game_over',
        winner: winnerRole,
        hostScore: scores.hostScore,
        partnerScore: scores.partnerScore,
        hostLine: room.host_line,
        partnerLine: room.partner_line,
        bonusBingo: true
      });

      return new Response(JSON.stringify({
        success: true,
        myScore,
        partnerScore: partnerScoreVal,
        gameOver: true,
        bonusBingo: true
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Not game over — broadcast mark
    this.broadcastToRoom({
      type: 'square_marked',
      index,
      markedBy: playerId,
      hostScore: scores.hostScore,
      partnerScore: scores.partnerScore
    });

    this.updateRoom({ last_activity: Date.now() });

    return new Response(JSON.stringify({
      success: true,
      myScore,
      partnerScore: partnerScoreVal,
      gameOver: false
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
```

Note: removed `hit` field from response (no longer relevant — score includes all marks now).

- [ ] **Step 2: Commit**

```bash
git add worker.js
git commit -m "markSquare: use checkBonusBingo instead of score>=5"
```

---

### Task 4: Update `getState` and `performDailyReset` for points-based winner

**Files:**
- Modify: `worker.js:939-1002` (`getState`)
- Modify: `worker.js:1004-1042` (`performDailyReset`)

- [ ] **Step 1: Update `getState` finished-phase winner determination**

Replace lines 990-997 (the `if (room.phase === 'finished')` block) with:

```javascript
    if (room.phase === 'finished') {
      response.myLine = isHost ? room.host_line : room.partner_line;
      response.partnerLine = isHost ? room.partner_line : room.host_line;
      // Determine winner — bonus bingo or highest score
      if (this.checkBonusBingo(room.host_id, room)) {
        response.winner = 'host';
      } else if (this.checkBonusBingo(room.partner_id, room)) {
        response.winner = 'partner';
      } else if (scores.hostScore > scores.partnerScore) {
        response.winner = 'host';
      } else if (scores.partnerScore > scores.hostScore) {
        response.winner = 'partner';
      } else {
        response.winner = 'tie';
      }
    }
```

- [ ] **Step 2: Update `performDailyReset` to determine winner by score**

Replace lines 1006-1021 (the snapshot block inside `performDailyReset`) with:

```javascript
    if ((room.phase === 'playing' || room.phase === 'finished') && room.host_line && room.partner_line) {
      const scores = this.computeScores(room);
      const allMarks = this.getMarks();
      let winner = null;

      // Check bonus bingo first, then score
      if (this.checkBonusBingo(room.host_id, room)) {
        winner = room.host_name;
      } else if (this.checkBonusBingo(room.partner_id, room)) {
        winner = room.partner_name;
      } else if (scores.hostScore > scores.partnerScore) {
        winner = room.host_name;
      } else if (scores.partnerScore > scores.hostScore) {
        winner = room.partner_name;
      }
      // else: tie, winner stays null

      this.sql.exec(
        `INSERT OR IGNORE INTO snapshots (date, host_id, host_name, partner_id, partner_name, host_score, partner_score, winner, host_line, partner_line, marks_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        room.daily_seed, room.host_id, room.host_name, room.partner_id, room.partner_name,
        scores.hostScore, scores.partnerScore, winner,
        JSON.stringify(room.host_line), JSON.stringify(room.partner_line),
        JSON.stringify(allMarks)
      );
    }
```

- [ ] **Step 3: Commit**

```bash
git add worker.js
git commit -m "getState/dailyReset: points-based winner when no bonus bingo"
```

---

### Task 5: Update unmark handler scores in worker.js

**Files:**
- Modify: `worker.js:820-852` (unmark/toggle block)

No code changes needed — `computeScores()` already returns the new score format (marks + lines × 3). The unmark handler at lines 830-851 calls `computeScores()` and broadcasts updated scores. This works as-is.

- [ ] **Step 1: Verify unmark still works by reading the code**

The unmark block (lines 829-851) deletes the mark, calls `this.computeScores(room)`, and broadcasts. Since `computeScores` now returns the new formula, scores will automatically reflect the change. No modification needed.

---

### Task 6: Add `countCompletedLines` helper to frontend

**Files:**
- Modify: `src/lib/dailyCard.ts:109-133` (after `getLineIndices`)

- [ ] **Step 1: Add `ALL_LINES` and `countCompletedLines` to dailyCard.ts**

Add after the `isSquareInLine` function:

```typescript
/** All 12 possible bingo lines on a 5x5 grid */
export const ALL_LINES: Array<{ type: 'row' | 'col' | 'diag'; index: number }> = [
  { type: 'row', index: 0 }, { type: 'row', index: 1 }, { type: 'row', index: 2 },
  { type: 'row', index: 3 }, { type: 'row', index: 4 },
  { type: 'col', index: 0 }, { type: 'col', index: 1 }, { type: 'col', index: 2 },
  { type: 'col', index: 3 }, { type: 'col', index: 4 },
  { type: 'diag', index: 0 }, { type: 'diag', index: 1 }
];

/** Count how many bingo lines are fully completed (all 5 squares marked by anyone) */
export function countCompletedLines(markedIndices: number[]): number {
  const markedSet = new Set(markedIndices);
  let count = 0;
  for (const line of ALL_LINES) {
    const indices = getLineIndices(line);
    if (indices.every(idx => markedSet.has(idx))) {
      count++;
    }
  }
  return count;
}

/** Get indices of all completed bingo lines (for highlighting) */
export function getCompletedLineIndices(markedIndices: number[]): number[][] {
  const markedSet = new Set(markedIndices);
  const completed: number[][] = [];
  for (const line of ALL_LINES) {
    const indices = getLineIndices(line);
    if (indices.every(idx => markedSet.has(idx))) {
      completed.push(indices);
    }
  }
  return completed;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/dailyCard.ts
git commit -m "add countCompletedLines and getCompletedLineIndices helpers"
```

---

### Task 7: Update DuoScoreboard to show points

**Files:**
- Modify: `src/components/bingo/DuoScoreboard.tsx` (full file, 51 lines)

- [ ] **Step 1: Replace score display from X/5 to points**

Replace lines 32-33 and 37-38 (the score text elements) and the scoring info section:

Change `{myScore}/5` to `{myScore}` and `{partnerScore}/5` to `{partnerScore}`.

Replace the scoring info div (lines 42-46) with:

```tsx
      {/* Scoring Info */}
      <div className="text-[10px] text-j-muted text-center font-mono">
        <span>+1 per mark</span>
        <span className="mx-1">·</span>
        <span>+3 per bingo line</span>
        <span className="mx-1">·</span>
        <span>Bonus bingo = instant win</span>
      </div>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/bingo/DuoScoreboard.tsx
git commit -m "scoreboard: show total points, update scoring info text"
```

---

### Task 8: Update GameOverScreen for points and bonus bingo

**Files:**
- Modify: `src/components/bingo/GameOverScreen.tsx` (full file, 92 lines)

- [ ] **Step 1: Add `bonusBingo` to duoStore state**

In `src/stores/duoStore.ts`, add `bonusBingo: boolean` to `DuoState` interface (after `gameOver: boolean` at line 75):

```typescript
  bonusBingo: boolean;
```

And in the initial state (find the `create` call with defaults), add `bonusBingo: false`.

In `handleGameOver` (line 365), accept and set `bonusBingo`:

```typescript
        handleGameOver: (winner: string, myScore: number, partnerScore: number, hostLine: LineSelection, partnerLine: LineSelection, bonusBingo: boolean = false) => {
```

Add to the `set()` call at line 384: `bonusBingo,`

In `handleDailyReset` (line 396), add `bonusBingo: false` to the reset set() call.

- [ ] **Step 2: Update connectionStore to pass `bonusBingo`**

In `src/stores/connectionStore.ts` at line 207, update the `handleGameOver` call:

```typescript
        duoStore.handleGameOver(message.winner, myScore, partnerScore, message.hostLine, message.partnerLine, message.bonusBingo ?? false);
```

- [ ] **Step 3: Update GameOverScreen score display and win text**

Replace `{myScore}/5` with `{myScore} pts` and `{partnerScore}/5` with `{partnerScore} pts` (lines 63, 67).

Add `bonusBingo` to the destructured store values:

```tsx
  const {
    odName,
    partnerName,
    myScore,
    partnerScore,
    winner,
    dailySeed,
    bonusBingo,
  } = useDuoStore();
```

Update `getWinnerText()` to indicate bonus bingo:

```typescript
  const getWinnerText = () => {
    if (winner === 'tie') return "It's a tie!";
    if (winner === 'me') return bonusBingo ? 'Bonus Bingo! You win!' : 'You win!';
    return bonusBingo ? `Bonus Bingo! ${partnerName || 'Partner'} wins!` : `${partnerName || 'Partner'} wins!`;
  };
```

- [ ] **Step 4: Commit**

```bash
git add src/stores/duoStore.ts src/stores/connectionStore.ts src/components/bingo/GameOverScreen.tsx
git commit -m "game over: show points, distinguish bonus bingo from score win"
```

---

### Task 9: Add bingo line highlighting to BingoCard

**Files:**
- Modify: `src/components/bingo/BingoCard.tsx:45-52` (line visualization section)

- [ ] **Step 1: Import `getCompletedLineIndices` and add highlighting during play**

Add import at top of BingoCard.tsx:

```typescript
import { getCompletedLineIndices } from '../../lib/dailyCard';
```

Inside the component (after `const iAmPartner = isHost === false;`), compute completed lines from current marks. `marks` is `MarkEntry[]` with `{ index: number, markedBy: string }`:

```typescript
  const completedLineSquares = useMemo(() => {
    const markedIndices = marks.map(m => m.index);
    const lines = getCompletedLineIndices(markedIndices);
    return new Set(lines.flat());
  }, [marks]);
```

Add `useMemo` to the import from `react`.

- [ ] **Step 2: Add visual indicator for squares in completed lines**

During the `playing` phase, add a subtle highlight (e.g., ring or background glow) to squares that are part of a completed bingo line. Add a CSS class conditionally:

```typescript
const isInCompletedLine = completedLineSquares.has(index);
```

Add to the square's className: `${isInCompletedLine ? 'ring-1 ring-j-accent/50' : ''}`

- [ ] **Step 3: Commit**

```bash
git add src/components/bingo/BingoCard.tsx
git commit -m "highlight completed bingo lines during play"
```

---

### Task 10: Update API response type and remove `hit` field

**Files:**
- Modify: `src/lib/api.ts:38-45` (`DuoMarkResponse`)

- [ ] **Step 1: Update DuoMarkResponse type**

Remove `hit` field, add `bonusBingo`:

```typescript
interface DuoMarkResponse {
  success: boolean;
  myScore: number;
  partnerScore: number;
  gameOver: boolean;
  bonusBingo?: boolean;
  unmarked?: boolean;
}
```

- [ ] **Step 2: Remove any usage of `hit` in duoStore**

Search for `hit` references in duoStore.ts and remove them. The `hit` field was used for haptic feedback when marking opponent's line — remove or keep haptic on all marks (simpler).

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.ts src/stores/duoStore.ts
git commit -m "api types: remove hit field, add bonusBingo"
```

---

### Task 11: Update polling handler in connectionStore

**Files:**
- Modify: `src/stores/connectionStore.ts:222-308` (polling handler)

- [ ] **Step 1: Check `handlePollingUpdate` for score>=5 or BINGO references**

The polling handler at lines 274-287 detects the finished phase and determines the winner. This mirrors the `getState` response which now returns the correct winner (bonus bingo or score-based). No changes needed to the polling logic — it reads `response.winner` from the server which is already correct after Task 4.

- [ ] **Step 2: Verify by reading the polling handler**

Confirm the handler uses `response.winner` from server response, not client-side score comparison. If it does any `score >= 5` checks, update them.

- [ ] **Step 3: Commit if changes were needed**

---

### Task 12: Deploy and test

- [ ] **Step 1: Build frontend**

```bash
npm run build
```

Expected: no TypeScript errors, clean build.

- [ ] **Step 2: Deploy worker**

```bash
npx wrangler deploy
```

- [ ] **Step 3: Push to GitHub (triggers Netlify deploy)**

```bash
git push
```

- [ ] **Step 4: E2E test via Playwright (two tabs)**

Test the following scenarios:
1. Both players mark squares, verify scores show as points (not X/5)
2. Complete a bingo line (any row/col/diagonal) — verify score jumps by +3
3. Complete opponent's secret line — verify instant win ("Bonus Bingo!")
4. Let a game run without bonus bingo — verify midnight logic picks score-based winner

---

## Summary of changes by file

| File | Change |
|------|--------|
| `worker.js` | New `countCompletedLines`, rewrite `computeScore` (marks + lines×3), new `checkBonusBingo`, update mark/state/reset handlers |
| `src/lib/dailyCard.ts` | New `ALL_LINES`, `countCompletedLines`, `getCompletedLineIndices` |
| `src/lib/api.ts` | Remove `hit` from DuoMarkResponse, add `bonusBingo` |
| `src/stores/duoStore.ts` | Add `bonusBingo` state, update `handleGameOver` signature |
| `src/stores/connectionStore.ts` | Pass `bonusBingo` to `handleGameOver` |
| `src/components/bingo/DuoScoreboard.tsx` | Points display, updated scoring info text |
| `src/components/bingo/GameOverScreen.tsx` | Points display, bonus bingo win text |
| `src/components/bingo/BingoCard.tsx` | Highlight completed bingo lines |
