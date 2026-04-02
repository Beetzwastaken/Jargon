# Duo Mode Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild duo mode game logic with reversed scoring (your score = partner's line squares you marked), attributed marks, sequential line picking, early win, and shareable results.

**Architecture:** Hybrid rebuild — keep networking layer (WebSocket client, polling client, API client, connectionStore pattern), rebuild game logic from scratch on both backend (Cloudflare Worker Durable Object with SQLite) and frontend (duoStore, game components). Server is sole source of truth for scoring.

**Tech Stack:** React 19, TypeScript, Zustand, Cloudflare Workers + Durable Objects (SQLite), Vite, Tailwind CSS, Vitest

**Spec:** `docs/superpowers/specs/2026-04-01-duo-mode-redesign.md`

---

## File Map

### Backend (rebuild)
- **Modify:** `worker.js` — rewrite `BingoRoom` Durable Object class (SQLite tables, new game logic, new message protocol). Keep: Worker `fetch()` routing shell, CORS, room code generation, analytics delegation.

### Frontend — Stores (rebuild)
- **Modify:** `src/stores/duoStore.ts` — new state shape, server-authoritative scoring, new phases, snapshot support
- **Modify:** `src/stores/connectionStore.ts` — update WebSocket message handlers for new protocol
- **Modify:** `src/lib/polling.ts` — update `DuoStateUpdate` interface for new state shape

### Frontend — Lib (modify)
- **Modify:** `src/lib/dailyCard.ts` — switch `getTodayDateString()` to UTC, add `getUTCDateString()`
- **Modify:** `src/lib/api.ts` — update endpoint response types for new mark/select contracts
- **Modify:** `src/lib/websocket.ts` — update `DuoWebSocketMessage` type and `DUO_MESSAGE_TYPES`

### Frontend — Components (rebuild/new)
- **Modify:** `src/components/bingo/BingoCard.tsx` — color-coded marks by player, subtle line indicator, hit animation
- **Modify:** `src/components/bingo/DuoScoreboard.tsx` — new scoring display, remove line name reveal
- **Modify:** `src/components/bingo/LineSelector.tsx` — sequential turn-based UI
- **Create:** `src/components/bingo/GameOverScreen.tsx` — results, revealed lines, countdown, share
- **Create:** `src/components/bingo/ShareCard.tsx` — emoji grid generation + clipboard
- **Modify:** `src/App.tsx` — wire new phases (`finished`), new components, hide solo mode

### Types
- **Modify:** `src/types/shared.ts` — lean shared types for new model
- **Modify:** `src/types/index.ts` — update `BingoSquare` (remove `isMarked`, marks are separate)

### Tests
- **Create:** `tests/unit/worker-game-logic.test.ts` — scoring, bingo detection, turn order, mark toggle
- **Create:** `tests/unit/duoStore.test.ts` — state transitions, server sync
- **Create:** `tests/unit/shareCard.test.ts` — emoji grid generation

---

## Task 1: Switch Daily Card to UTC

**Files:**
- Modify: `src/lib/dailyCard.ts`
- Modify: `worker.js` (lines 69-83, `getTodayInTimezone` function)

- [ ] **Step 1: Update `getTodayDateString` to use UTC**

In `src/lib/dailyCard.ts`, replace the timezone-based function:

```typescript
/**
 * Get today's date string in UTC
 * @returns YYYY-MM-DD string for current UTC date
 */
export function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}
```

Remove the `timezone` parameter. Remove `getLocalTimezone()` export. Update `hasNewDayStarted` to drop the timezone param:

```typescript
export function hasNewDayStarted(lastSeed: string): boolean {
  const currentDate = getTodayDateString();
  return currentDate !== lastSeed;
}
```

- [ ] **Step 2: Update worker.js `getTodayInTimezone` to UTC**

Replace in `worker.js`:

```javascript
function getTodayUTC() {
  return new Date().toISOString().split('T')[0];
}
```

Remove `getTodayInTimezone` entirely.

- [ ] **Step 3: Fix all callsites**

Search for `getTodayDateString(` and `getTodayInTimezone(` across the codebase. Update each to use the new zero-arg UTC version. Key locations:
- `src/stores/duoStore.ts` — `createGame`, `selectLine`, `handlePartnerSelected`, `handleCardRevealed`, `handleDailyReset`, `checkDailyReset`, `onRehydrateStorage`
- `src/stores/soloStore.ts` — daily card init
- `worker.js` — `getState`, `createDuoGame`

- [ ] **Step 4: Verify build compiles**

Run: `cd /c/Users/Ryan/CC/Projects/Jargon && npm run build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dailyCard.ts worker.js src/stores/duoStore.ts src/stores/soloStore.ts
git commit -m "switch daily card seed to UTC, drop timezone params"
```

---

## Task 2: Rebuild Worker Durable Object — Schema & Helpers

**Files:**
- Modify: `worker.js` — replace `BingoRoom` class internals

- [ ] **Step 1: Write SQLite schema initialization in BingoRoom constructor**

Replace the `BingoRoom` constructor and add `initializeSchema`:

```javascript
export class BingoRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map(); // playerId -> WebSocket
    this.sql = state.storage.sql;
    this.initializeSchema();
  }

  initializeSchema() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS room (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        code TEXT NOT NULL,
        host_id TEXT NOT NULL,
        host_name TEXT NOT NULL,
        partner_id TEXT,
        partner_name TEXT,
        phase TEXT NOT NULL DEFAULT 'waiting',
        host_line TEXT,
        partner_line TEXT,
        host_first_pick INTEGER NOT NULL DEFAULT 1,
        daily_seed TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_activity INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS marks (
        idx INTEGER PRIMARY KEY,
        marked_by TEXT NOT NULL,
        marked_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS snapshots (
        date TEXT PRIMARY KEY,
        host_id TEXT NOT NULL,
        host_name TEXT NOT NULL,
        partner_id TEXT NOT NULL,
        partner_name TEXT NOT NULL,
        host_score INTEGER NOT NULL,
        partner_score INTEGER NOT NULL,
        winner TEXT NOT NULL,
        host_line TEXT NOT NULL,
        partner_line TEXT NOT NULL,
        marks_json TEXT NOT NULL
      );
    `);
  }
```

- [ ] **Step 2: Write helper functions for room CRUD**

```javascript
  getRoom() {
    const row = this.sql.exec("SELECT * FROM room WHERE id = 1").toArray()[0];
    if (!row) return null;
    return {
      ...row,
      host_line: row.host_line ? JSON.parse(row.host_line) : null,
      partner_line: row.partner_line ? JSON.parse(row.partner_line) : null,
      host_first_pick: !!row.host_first_pick
    };
  }

  updateRoom(fields) {
    const sets = [];
    const vals = [];
    for (const [key, value] of Object.entries(fields)) {
      sets.push(`${key} = ?`);
      if (key === 'host_line' || key === 'partner_line') {
        vals.push(value ? JSON.stringify(value) : null);
      } else {
        vals.push(value);
      }
    }
    vals.push(Date.now());
    this.sql.exec(
      `UPDATE room SET ${sets.join(', ')}, last_activity = ? WHERE id = 1`,
      ...vals
    );
  }

  getMarks() {
    return this.sql.exec("SELECT idx, marked_by, marked_at FROM marks ORDER BY idx").toArray();
  }

  computeScore(playerId, room) {
    const opponentLine = (playerId === room.host_id) ? room.partner_line : room.host_line;
    if (!opponentLine) return 0;
    const lineIndices = getLineIndices(opponentLine);
    const marks = this.sql.exec(
      "SELECT idx FROM marks WHERE marked_by = ?", playerId
    ).toArray();
    return marks.filter(m => lineIndices.includes(m.idx)).length;
  }

  computeScores(room) {
    return {
      hostScore: this.computeScore(room.host_id, room),
      partnerScore: this.computeScore(room.partner_id, room)
    };
  }

  isPickTurn(playerId, room) {
    const dateNum = parseInt(room.daily_seed.replace(/-/g, ''));
    const hostFirst = dateNum % 2 === 0;
    if (hostFirst) {
      // Host picks first. If host hasn't picked, only host can go.
      if (!room.host_line) return playerId === room.host_id;
      // Host picked. Partner's turn.
      return playerId === room.partner_id;
    } else {
      if (!room.partner_line) return playerId === room.partner_id;
      return playerId === room.host_id;
    }
  }
```

- [ ] **Step 3: Verify the file still parses**

Run: `cd /c/Users/Ryan/CC/Projects/Jargon && node -c worker.js`
Expected: No syntax errors.

- [ ] **Step 4: Commit**

```bash
git add worker.js
git commit -m "rebuild BingoRoom: SQLite schema, room/marks/score helpers"
```

---

## Task 3: Rebuild Worker — Create, Join, Leave, Exists

**Files:**
- Modify: `worker.js` — replace `createDuoGame`, `joinDuoGame`, `leaveGame`, exists check

- [ ] **Step 1: Rewrite `createDuoGame`**

```javascript
  async createDuoGame(request) {
    const { playerName, roomCode } = await request.json();
    const hostId = crypto.randomUUID();
    const dailySeed = getTodayUTC();
    const dateNum = parseInt(dailySeed.replace(/-/g, ''));
    const hostFirstPick = dateNum % 2 === 0 ? 1 : 0;

    this.sql.exec(
      `INSERT OR REPLACE INTO room (id, code, host_id, host_name, phase, host_first_pick, daily_seed, created_at, last_activity)
       VALUES (1, ?, ?, ?, 'waiting', ?, ?, ?, ?)`,
      roomCode, hostId, playerName, hostFirstPick, dailySeed, Date.now(), Date.now()
    );

    return new Response(JSON.stringify({
      success: true,
      code: roomCode,
      playerId: hostId,
      playerName,
      dailySeed
    }), { headers: { 'Content-Type': 'application/json' } });
  }
```

- [ ] **Step 2: Rewrite `joinDuoGame`**

```javascript
  async joinDuoGame(request) {
    const { playerName } = await request.json();
    const room = this.getRoom();

    if (!room) {
      return new Response(JSON.stringify({ error: 'Room not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Rejoin check — host
    if (room.host_name === playerName) {
      return new Response(JSON.stringify({
        success: true, playerId: room.host_id, playerName: room.host_name,
        partnerName: room.partner_name, phase: room.phase, dailySeed: room.daily_seed, isHost: true
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Rejoin check — partner
    if (room.partner_id && room.partner_name === playerName) {
      return new Response(JSON.stringify({
        success: true, playerId: room.partner_id, playerName: room.partner_name,
        partnerName: room.host_name, phase: room.phase, dailySeed: room.daily_seed, isHost: false
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (room.partner_id) {
      return new Response(JSON.stringify({ error: 'Room full' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const partnerId = crypto.randomUUID();
    this.updateRoom({ partner_id: partnerId, partner_name: playerName, phase: 'selecting' });

    this.broadcastToRoom({
      type: 'partner_joined', partnerId, partnerName: playerName
    });

    return new Response(JSON.stringify({
      success: true, playerId: partnerId, playerName,
      partnerName: room.host_name, phase: 'selecting', dailySeed: room.daily_seed, isHost: false
    }), { headers: { 'Content-Type': 'application/json' } });
  }
```

- [ ] **Step 3: Rewrite `leaveGame`**

```javascript
  async leaveGame(request) {
    const playerId = request.headers.get('X-Player-ID');
    const room = this.getRoom();
    if (!room) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    this.broadcastToRoom({ type: 'partner_left', playerId }, playerId);

    if (playerId === room.host_id) {
      // Host leaves — destroy room
      this.sql.exec("DELETE FROM room WHERE id = 1");
      this.sql.exec("DELETE FROM marks");
    } else if (playerId === room.partner_id) {
      // Partner leaves — reset to waiting
      this.sql.exec("DELETE FROM marks");
      this.updateRoom({
        partner_id: null, partner_name: null, phase: 'waiting',
        host_line: null, partner_line: null
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
```

- [ ] **Step 4: Update exists check**

```javascript
  // In fetch():
  if (url.pathname === '/exists') {
    const room = this.getRoom();
    return room ? new Response('exists') : new Response('not found', { status: 404 });
  }
```

- [ ] **Step 5: Verify syntax**

Run: `cd /c/Users/Ryan/CC/Projects/Jargon && node -c worker.js`

- [ ] **Step 6: Commit**

```bash
git add worker.js
git commit -m "rebuild worker: create, join, leave with SQLite"
```

---

## Task 4: Rebuild Worker — Select Line (Sequential)

**Files:**
- Modify: `worker.js` — replace `selectLine`

- [ ] **Step 1: Rewrite `selectLine` with turn enforcement**

```javascript
  async selectLine(request) {
    const playerId = request.headers.get('X-Player-ID');
    const { line } = await request.json();
    const room = this.getRoom();

    if (!room) {
      return new Response(JSON.stringify({ error: 'Room not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json' }
      });
    }

    if (room.phase !== 'selecting') {
      return new Response(JSON.stringify({ error: 'Not in selection phase' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const isHost = playerId === room.host_id;
    const isPartner = playerId === room.partner_id;
    if (!isHost && !isPartner) {
      return new Response(JSON.stringify({ error: 'Player not in room' }), {
        status: 403, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate line
    if (!line || !['row', 'col', 'diag'].includes(line.type) || typeof line.index !== 'number') {
      return new Response(JSON.stringify({ error: 'Invalid line' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Enforce turn order
    if (!this.isPickTurn(playerId, room)) {
      return new Response(JSON.stringify({ error: 'Not your turn to pick' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check line not already taken by first picker
    const existingLine = isHost ? room.partner_line : room.host_line;
    if (existingLine && existingLine.type === line.type && existingLine.index === line.index) {
      return new Response(JSON.stringify({ error: 'Line already taken' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Store selection
    if (isHost) {
      this.updateRoom({ host_line: line });
    } else {
      this.updateRoom({ partner_line: line });
    }

    // Check if both have now selected
    const updated = this.getRoom();
    if (updated.host_line && updated.partner_line) {
      this.updateRoom({ phase: 'playing' });
      this.broadcastToRoom({ type: 'both_selected' });

      return new Response(JSON.stringify({ success: true, phase: 'playing' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Notify other player it's their turn
    const otherPlayerId = isHost ? room.partner_id : room.host_id;
    this.sendToPlayer(otherPlayerId, { type: 'your_turn_to_pick' });

    return new Response(JSON.stringify({ success: true, waiting: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
```

- [ ] **Step 2: Verify syntax**

Run: `cd /c/Users/Ryan/CC/Projects/Jargon && node -c worker.js`

- [ ] **Step 3: Commit**

```bash
git add worker.js
git commit -m "rebuild worker: sequential line selection with turn enforcement"
```

---

## Task 5: Rebuild Worker — Mark Square (Toggle + Scoring)

**Files:**
- Modify: `worker.js` — replace `markSquare`

- [ ] **Step 1: Rewrite `markSquare` with toggle, attribution, and hit detection**

```javascript
  async markSquare(request) {
    const playerId = request.headers.get('X-Player-ID');
    const { index } = await request.json();
    const room = this.getRoom();

    if (!room) {
      return new Response(JSON.stringify({ error: 'Room not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json' }
      });
    }

    if (room.phase !== 'playing') {
      return new Response(JSON.stringify({ error: 'Game not in playing phase' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    if (index < 0 || index > 24) {
      return new Response(JSON.stringify({ error: 'Invalid index' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const isHost = playerId === room.host_id;
    const isPartner = playerId === room.partner_id;
    if (!isHost && !isPartner) {
      return new Response(JSON.stringify({ error: 'Player not in room' }), {
        status: 403, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check existing mark
    const existing = this.sql.exec("SELECT marked_by FROM marks WHERE idx = ?", index).toArray()[0];

    if (existing) {
      // Toggle off — only the original marker can unmark
      if (existing.marked_by !== playerId) {
        return new Response(JSON.stringify({ error: 'Only the marker can unmark' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        });
      }
      this.sql.exec("DELETE FROM marks WHERE idx = ?", index);

      const scores = this.computeScores(room);
      this.broadcastToRoom({
        type: 'square_unmarked', index, hostScore: scores.hostScore, partnerScore: scores.partnerScore
      });

      return new Response(JSON.stringify({
        success: true, unmarked: true, hit: false,
        myScore: isHost ? scores.hostScore : scores.partnerScore,
        partnerScore: isHost ? scores.partnerScore : scores.hostScore,
        gameOver: false
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Mark the square
    this.sql.exec(
      "INSERT INTO marks (idx, marked_by, marked_at) VALUES (?, ?, ?)",
      index, playerId, Date.now()
    );

    const scores = this.computeScores(room);

    // Check if this was a hit (on opponent's line)
    const opponentLine = isHost ? room.partner_line : room.host_line;
    const hit = opponentLine ? getLineIndices(opponentLine).includes(index) : false;

    // Check for BINGO (score = 5)
    const myScore = isHost ? scores.hostScore : scores.partnerScore;
    const gameOver = myScore === 5;

    if (gameOver) {
      this.updateRoom({ phase: 'finished' });

      // Store snapshot
      const marks = this.getMarks();
      const winner = scores.hostScore > scores.partnerScore ? 'host'
        : scores.partnerScore > scores.hostScore ? 'partner' : 'tie';
      this.sql.exec(
        `INSERT OR REPLACE INTO snapshots (date, host_id, host_name, partner_id, partner_name, host_score, partner_score, winner, host_line, partner_line, marks_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        room.daily_seed, room.host_id, room.host_name, room.partner_id, room.partner_name,
        scores.hostScore, scores.partnerScore, winner,
        JSON.stringify(room.host_line), JSON.stringify(room.partner_line), JSON.stringify(marks)
      );

      this.broadcastToRoom({
        type: 'game_over', winner,
        hostScore: scores.hostScore, partnerScore: scores.partnerScore,
        hostLine: room.host_line, partnerLine: room.partner_line
      });
    } else {
      this.broadcastToRoom({
        type: 'square_marked', index, markedBy: playerId,
        hostScore: scores.hostScore, partnerScore: scores.partnerScore
      });
    }

    return new Response(JSON.stringify({
      success: true, hit,
      myScore: isHost ? scores.hostScore : scores.partnerScore,
      partnerScore: isHost ? scores.partnerScore : scores.hostScore,
      gameOver
    }), { headers: { 'Content-Type': 'application/json' } });
  }
```

- [ ] **Step 2: Verify syntax**

Run: `cd /c/Users/Ryan/CC/Projects/Jargon && node -c worker.js`

- [ ] **Step 3: Commit**

```bash
git add worker.js
git commit -m "rebuild worker: mark/unmark with attribution, scoring, bingo detection"
```

---

## Task 6: Rebuild Worker — getState, Snapshot, Daily Reset

**Files:**
- Modify: `worker.js` — replace `getState`, add snapshot endpoint, add daily reset

- [ ] **Step 1: Rewrite `getState` (player-aware, hides partner line)**

```javascript
  async getState(request) {
    const playerId = request.headers.get('X-Player-ID');
    const room = this.getRoom();

    if (!room) {
      return new Response(JSON.stringify({ error: 'Room not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check for daily reset
    const currentDate = getTodayUTC();
    if (currentDate !== room.daily_seed) {
      await this.performDailyReset(room, currentDate);
      const updatedRoom = this.getRoom();
      return this.buildStateResponse(updatedRoom, playerId);
    }

    return this.buildStateResponse(room, playerId);
  }

  buildStateResponse(room, playerId) {
    const isHost = playerId === room.host_id;
    const marks = this.getMarks();
    const scores = room.host_line && room.partner_line ? this.computeScores(room) : { hostScore: 0, partnerScore: 0 };

    const response = {
      code: room.code,
      phase: room.phase,
      dailySeed: room.daily_seed,
      isHost,
      hostName: room.host_name,
      partnerName: room.partner_name,
      isPaired: !!room.partner_id,
      marks: marks.map(m => ({ index: m.idx, markedBy: m.marked_by })),
      myScore: isHost ? scores.hostScore : scores.partnerScore,
      partnerScore: isHost ? scores.partnerScore : scores.hostScore,
      card: generateDailyCard(room.daily_seed)
    };

    // Selection phase — include turn info
    if (room.phase === 'selecting') {
      response.isMyTurnToPick = this.isPickTurn(playerId, room);
      response.myLine = isHost ? room.host_line : room.partner_line;
      response.partnerHasSelected = isHost ? !!room.partner_line : !!room.host_line;
    }

    // Playing phase — include own line, hide partner line
    if (room.phase === 'playing') {
      response.myLine = isHost ? room.host_line : room.partner_line;
    }

    // Finished phase — reveal both lines
    if (room.phase === 'finished') {
      response.myLine = isHost ? room.host_line : room.partner_line;
      response.partnerLine = isHost ? room.partner_line : room.host_line;
      response.winner = scores.hostScore > scores.partnerScore ? (isHost ? 'me' : 'partner')
        : scores.partnerScore > scores.hostScore ? (isHost ? 'partner' : 'me') : 'tie';
    }

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
```

- [ ] **Step 2: Add daily reset logic**

```javascript
  async performDailyReset(room, newSeed) {
    // Snapshot current game if it was in progress
    if (room.phase === 'playing' && room.host_line && room.partner_line) {
      const scores = this.computeScores(room);
      const marks = this.getMarks();
      const winner = scores.hostScore > scores.partnerScore ? 'host'
        : scores.partnerScore > scores.hostScore ? 'partner' : 'tie';

      this.sql.exec(
        `INSERT OR REPLACE INTO snapshots (date, host_id, host_name, partner_id, partner_name, host_score, partner_score, winner, host_line, partner_line, marks_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        room.daily_seed, room.host_id, room.host_name, room.partner_id, room.partner_name,
        scores.hostScore, scores.partnerScore, winner,
        JSON.stringify(room.host_line), JSON.stringify(room.partner_line), JSON.stringify(marks)
      );
    }

    // Clear marks
    this.sql.exec("DELETE FROM marks");

    // Determine new pick order
    const dateNum = parseInt(newSeed.replace(/-/g, ''));
    const hostFirstPick = dateNum % 2 === 0 ? 1 : 0;

    // Reset for new day
    const newPhase = room.partner_id ? 'selecting' : 'waiting';
    this.updateRoom({
      daily_seed: newSeed, phase: newPhase,
      host_line: null, partner_line: null,
      host_first_pick: hostFirstPick
    });

    this.broadcastToRoom({ type: 'daily_reset', newSeed });
  }
```

- [ ] **Step 3: Add snapshot endpoint**

Add to the `fetch()` routing in `BingoRoom`:

```javascript
  if (url.pathname === '/duo/snapshot') {
    return await this.getSnapshot(request);
  }
```

```javascript
  async getSnapshot(request) {
    const playerId = request.headers.get('X-Player-ID');
    const room = this.getRoom();
    if (!room) {
      return new Response(JSON.stringify({ error: 'Room not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get yesterday's date
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const snapshot = this.sql.exec(
      "SELECT * FROM snapshots WHERE date = ?", yesterdayStr
    ).toArray()[0];

    if (!snapshot) {
      return new Response(JSON.stringify({ snapshot: null }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const isHost = playerId === room.host_id;
    return new Response(JSON.stringify({
      snapshot: {
        date: snapshot.date,
        myScore: isHost ? snapshot.host_score : snapshot.partner_score,
        partnerScore: isHost ? snapshot.partner_score : snapshot.host_score,
        winner: snapshot.winner === 'tie' ? 'tie'
          : (snapshot.winner === 'host' && isHost) || (snapshot.winner === 'partner' && !isHost) ? 'me' : 'partner',
        myLine: JSON.parse(isHost ? snapshot.host_line : snapshot.partner_line),
        partnerLine: JSON.parse(isHost ? snapshot.partner_line : snapshot.host_line),
        marks: JSON.parse(snapshot.marks_json),
        myName: isHost ? snapshot.host_name : snapshot.partner_name,
        partnerName: isHost ? snapshot.partner_name : snapshot.host_name
      }
    }), { headers: { 'Content-Type': 'application/json' } });
  }
```

- [ ] **Step 4: Add routing for snapshot in main Worker fetch()**

In the main `export default` fetch handler, add before the health check:

```javascript
  // Duo: Get Snapshot - GET /api/duo/:code/snapshot
  if (url.pathname.match(/^\/api\/duo\/([A-Z0-9]{4})\/snapshot$/) && request.method === 'GET') {
    const roomCode = url.pathname.split('/')[3];
    const playerId = request.headers.get('X-Player-ID');
    const roomId = env.ROOMS.idFromName(roomCode);
    const roomObj = env.ROOMS.get(roomId);
    const response = await roomObj.fetch(new Request('https://dummy/duo/snapshot', {
      method: 'GET',
      headers: { 'X-Player-ID': playerId || '' }
    }));
    const result = await response.json();
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
    });
  }
```

- [ ] **Step 5: Verify syntax**

Run: `cd /c/Users/Ryan/CC/Projects/Jargon && node -c worker.js`

- [ ] **Step 6: Commit**

```bash
git add worker.js
git commit -m "rebuild worker: getState, daily reset, snapshot endpoint"
```

---

## Task 7: Rebuild Worker — WebSocket Handler

**Files:**
- Modify: `worker.js` — update WebSocket `handleWebSocket` and keep `broadcastToRoom`/`sendToPlayer`

- [ ] **Step 1: Update handleWebSocket to send correct initial state**

```javascript
  async handleWebSocket(request) {
    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();

    const url = new URL(request.url);
    const playerId = url.searchParams.get('playerId');

    if (playerId) {
      this.sessions.set(playerId, server);

      const room = this.getRoom();
      if (room) {
        const isHost = playerId === room.host_id;
        server.send(JSON.stringify({
          type: 'connected',
          phase: room.phase,
          isHost,
          hostName: room.host_name,
          partnerName: room.partner_name,
          isPaired: !!room.partner_id,
          isMyTurnToPick: room.phase === 'selecting' ? this.isPickTurn(playerId, room) : undefined
        }));
      }

      server.addEventListener('close', () => {
        this.sessions.delete(playerId);
      });

      server.addEventListener('message', async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'ping') {
            server.send(JSON.stringify({ type: 'pong' }));
          }
        } catch (e) {
          // Ignore parse errors
        }
      });
    }

    return new Response(null, { status: 101, webSocket: client });
  }
```

- [ ] **Step 2: Verify broadcastToRoom and sendToPlayer are unchanged**

These methods are already correct. Confirm they exist and have not been accidentally removed during refactoring.

- [ ] **Step 3: Commit**

```bash
git add worker.js
git commit -m "rebuild worker: update WebSocket handler for new protocol"
```

---

## Task 8: Update Frontend Types & API Client

**Files:**
- Modify: `src/lib/websocket.ts`
- Modify: `src/lib/api.ts`
- Modify: `src/lib/polling.ts`

- [ ] **Step 1: Update WebSocket message types**

In `src/lib/websocket.ts`, replace `DuoWebSocketMessage` and `DUO_MESSAGE_TYPES`:

```typescript
export interface DuoWebSocketMessage {
  type: string;
  // partner_joined
  partnerId?: string;
  partnerName?: string;
  // partner_left
  playerId?: string;
  // square_marked
  index?: number;
  markedBy?: string;
  hostScore?: number;
  partnerScore?: number;
  // square_unmarked
  // (same fields as square_marked minus markedBy)
  // game_over
  winner?: string;
  hostLine?: { type: 'row' | 'col' | 'diag'; index: number };
  partnerLine?: { type: 'row' | 'col' | 'diag'; index: number };
  // your_turn_to_pick — no extra fields
  // both_selected — no extra fields
  // daily_reset
  newSeed?: string;
  // connected
  phase?: string;
  isHost?: boolean;
  hostName?: string;
  isPaired?: boolean;
  isMyTurnToPick?: boolean;
}

export const DUO_MESSAGE_TYPES = {
  CONNECTED: 'connected',
  PING: 'ping',
  PONG: 'pong',
  PARTNER_JOINED: 'partner_joined',
  PARTNER_LEFT: 'partner_left',
  YOUR_TURN_TO_PICK: 'your_turn_to_pick',
  BOTH_SELECTED: 'both_selected',
  SQUARE_MARKED: 'square_marked',
  SQUARE_UNMARKED: 'square_unmarked',
  GAME_OVER: 'game_over',
  DAILY_RESET: 'daily_reset'
} as const;
```

- [ ] **Step 2: Update API response types**

In `src/lib/api.ts`, update `DuoMarkResponse`:

```typescript
export interface DuoMarkResponse {
  success: boolean;
  hit: boolean;
  myScore: number;
  partnerScore: number;
  gameOver: boolean;
  unmarked?: boolean;
}

export interface DuoSelectResponse {
  success: boolean;
  waiting?: boolean;
  phase?: string;
  error?: string;
}

export interface DuoSnapshotResponse {
  snapshot: {
    date: string;
    myScore: number;
    partnerScore: number;
    winner: 'me' | 'partner' | 'tie';
    myLine: { type: 'row' | 'col' | 'diag'; index: number };
    partnerLine: { type: 'row' | 'col' | 'diag'; index: number };
    marks: Array<{ idx: number; marked_by: string }>;
    myName: string;
    partnerName: string;
  } | null;
}
```

Add snapshot API function:

```typescript
export async function fetchSnapshot(roomCode: string, playerId: string): Promise<ApiResponse<DuoSnapshotResponse>> {
  return apiRequest<DuoSnapshotResponse>(`/api/duo/${roomCode}/snapshot`, {
    method: 'GET',
    headers: { 'X-Player-ID': playerId }
  });
}
```

- [ ] **Step 3: Update polling `DuoStateUpdate` interface**

In `src/lib/polling.ts`, replace `DuoStateUpdate`:

```typescript
export interface DuoStateUpdate {
  code: string;
  phase: 'waiting' | 'selecting' | 'playing' | 'finished';
  dailySeed: string;
  isHost: boolean;
  hostName: string;
  partnerName: string | null;
  isPaired: boolean;
  marks: Array<{ index: number; markedBy: string }>;
  myScore: number;
  partnerScore: number;
  card: string[];
  // selecting
  isMyTurnToPick?: boolean;
  myLine?: { type: 'row' | 'col' | 'diag'; index: number };
  partnerHasSelected?: boolean;
  // finished
  partnerLine?: { type: 'row' | 'col' | 'diag'; index: number };
  winner?: 'me' | 'partner' | 'tie';
}
```

- [ ] **Step 4: Verify build**

Run: `cd /c/Users/Ryan/CC/Projects/Jargon && npm run build`
Expected: May have errors from duoStore/connectionStore referencing old types. That's expected — we'll fix those next.

- [ ] **Step 5: Commit**

```bash
git add src/lib/websocket.ts src/lib/api.ts src/lib/polling.ts
git commit -m "update frontend types: new WebSocket protocol, API responses, polling state"
```

---

## Task 9: Rebuild duoStore

**Files:**
- Modify: `src/stores/duoStore.ts` — complete rewrite

- [ ] **Step 1: Write new duoStore**

Replace entire contents of `src/stores/duoStore.ts`:

```typescript
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { BingoSquare } from '../types';
import {
  generateDailyCard,
  getTodayDateString,
  hasNewDayStarted,
  getLineIndices
} from '../lib/dailyCard';
import {
  createDuoGame,
  joinDuoGame,
  selectLine as apiSelectLine,
  markSquare as apiMarkSquare,
  leaveDuoGame,
  fetchSnapshot
} from '../lib/api';
import { useConnectionStore } from './connectionStore';

export interface LineSelection {
  type: 'row' | 'col' | 'diag';
  index: number;
}

export type DuoPhase = 'unpaired' | 'waiting' | 'selecting' | 'playing' | 'finished';

interface Mark {
  index: number;
  markedBy: string;
}

interface YesterdaySnapshot {
  date: string;
  myScore: number;
  partnerScore: number;
  winner: 'me' | 'partner' | 'tie';
  myLine: LineSelection;
  partnerLine: LineSelection;
  marks: Array<{ idx: number; marked_by: string }>;
  myName: string;
  partnerName: string;
}

interface DuoState {
  pairCode: string | null;
  odId: string | null;
  odName: string | null;
  partnerId: string | null;
  partnerName: string | null;
  isPaired: boolean;
  isHost: boolean;

  phase: DuoPhase;

  myLine: LineSelection | null;
  isMyTurnToPick: boolean;
  partnerHasSelected: boolean;

  dailyCard: BingoSquare[];
  dailySeed: string;

  marks: Mark[];

  myScore: number;
  partnerScore: number;

  gameOver: boolean;
  winner: 'me' | 'partner' | 'tie' | null;
  partnerLine: LineSelection | null;

  snapshot: YesterdaySnapshot | null;
}

interface DuoActions {
  createGame: (playerName: string) => Promise<{ success: boolean; code?: string; error?: string }>;
  joinGame: (code: string, playerName: string) => Promise<{ success: boolean; error?: string }>;
  leaveGame: () => void;
  selectLine: (line: LineSelection) => Promise<{ success: boolean; error?: string }>;
  markSquare: (index: number) => Promise<{ hit: boolean } | void>;
  syncFromServer: (state: Partial<DuoState>) => void;
  handlePartnerJoined: (partner: { id: string; name: string }) => void;
  handlePartnerLeft: () => void;
  handleYourTurnToPick: () => void;
  handleBothSelected: () => void;
  handleSquareMarked: (index: number, markedBy: string, hostScore: number, partnerScore: number) => void;
  handleSquareUnmarked: (index: number, hostScore: number, partnerScore: number) => void;
  handleGameOver: (winner: string, hostScore: number, partnerScore: number, hostLine: LineSelection, partnerLine: LineSelection) => void;
  handleDailyReset: (newSeed: string) => void;
  loadSnapshot: () => Promise<void>;
  getMyLineIndices: () => number[];
}

type DuoStore = DuoState & DuoActions;

const initialState: DuoState = {
  pairCode: null,
  odId: null,
  odName: null,
  partnerId: null,
  partnerName: null,
  isPaired: false,
  isHost: false,
  phase: 'unpaired',
  myLine: null,
  isMyTurnToPick: false,
  partnerHasSelected: false,
  dailyCard: [],
  dailySeed: '',
  marks: [],
  myScore: 0,
  partnerScore: 0,
  gameOver: false,
  winner: null,
  partnerLine: null,
  snapshot: null
};

export const useDuoStore = create<DuoStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        createGame: async (playerName: string) => {
          const response = await createDuoGame(playerName, 'UTC');
          if (!response.success || !response.data) {
            return { success: false, error: response.error || 'Failed to create game' };
          }
          const { code, playerId, dailySeed } = response.data;
          const card = generateDailyCard(dailySeed);
          set({
            pairCode: code, odId: playerId, odName: playerName,
            isHost: true, isPaired: false, phase: 'waiting',
            dailySeed, dailyCard: card
          });
          useConnectionStore.getState().connect(code, playerId);
          return { success: true, code };
        },

        joinGame: async (code: string, playerName: string) => {
          const response = await joinDuoGame(code.toUpperCase(), playerName);
          if (!response.success || !response.data) {
            return { success: false, error: response.error || 'Failed to join game' };
          }
          const { playerId, partnerName, phase, dailySeed, isHost } = response.data;
          const card = generateDailyCard(dailySeed);
          set({
            pairCode: code.toUpperCase(), odId: playerId, odName: playerName,
            partnerName, isHost, isPaired: !isHost,
            phase: phase as DuoPhase, dailySeed, dailyCard: card
          });
          useConnectionStore.getState().connect(code.toUpperCase(), playerId);
          return { success: true };
        },

        leaveGame: () => {
          const state = get();
          if (state.pairCode && state.odId) {
            leaveDuoGame(state.pairCode, state.odId);
          }
          useConnectionStore.getState().disconnect();
          set(initialState);
        },

        selectLine: async (line: LineSelection) => {
          const state = get();
          if (!state.pairCode || !state.odId) {
            return { success: false, error: 'Not in a game' };
          }
          const response = await apiSelectLine(state.pairCode, state.odId, line);
          if (!response.success || !response.data) {
            return { success: false, error: response.error || 'Failed to select line' };
          }
          set({ myLine: line, isMyTurnToPick: false });
          if (response.data.phase === 'playing') {
            set({ phase: 'playing' });
          }
          return { success: true };
        },

        markSquare: async (index: number) => {
          const state = get();
          if (state.phase !== 'playing' || !state.pairCode || !state.odId) return;

          // Optimistic mark
          const existingMark = state.marks.find(m => m.index === index);
          if (existingMark) {
            if (existingMark.markedBy !== state.odId) return; // can't unmark other's
            set({ marks: state.marks.filter(m => m.index !== index) });
          } else {
            set({ marks: [...state.marks, { index, markedBy: state.odId }] });
          }

          const response = await apiMarkSquare(state.pairCode, state.odId, index);
          if (response.success && response.data) {
            set({
              myScore: response.data.myScore,
              partnerScore: response.data.partnerScore
            });
            return { hit: response.data.hit };
          }
        },

        syncFromServer: (newState: Partial<DuoState>) => set(newState),

        handlePartnerJoined: (partner) => {
          set({
            partnerId: partner.id, partnerName: partner.name,
            isPaired: true, phase: 'selecting'
          });
        },

        handlePartnerLeft: () => {
          set({
            partnerId: null, partnerName: null, isPaired: false,
            phase: 'waiting', myLine: null, partnerLine: null,
            marks: [], myScore: 0, partnerScore: 0,
            gameOver: false, winner: null, isMyTurnToPick: false, partnerHasSelected: false
          });
        },

        handleYourTurnToPick: () => set({ isMyTurnToPick: true, partnerHasSelected: true }),

        handleBothSelected: () => {
          const state = get();
          const card = generateDailyCard(state.dailySeed);
          set({ phase: 'playing', dailyCard: card });
        },

        handleSquareMarked: (index, markedBy, hostScore, partnerScore) => {
          const state = get();
          const newMarks = state.marks.filter(m => m.index !== index);
          newMarks.push({ index, markedBy });
          set({
            marks: newMarks,
            myScore: state.isHost ? hostScore : partnerScore,
            partnerScore: state.isHost ? partnerScore : hostScore
          });
        },

        handleSquareUnmarked: (index, hostScore, partnerScore) => {
          const state = get();
          set({
            marks: state.marks.filter(m => m.index !== index),
            myScore: state.isHost ? hostScore : partnerScore,
            partnerScore: state.isHost ? partnerScore : hostScore
          });
        },

        handleGameOver: (winner, hostScore, partnerScore, hostLine, partnerLine) => {
          const state = get();
          const isHost = state.isHost;
          set({
            phase: 'finished', gameOver: true,
            winner: winner === 'tie' ? 'tie' : (winner === 'host' && isHost) || (winner === 'partner' && !isHost) ? 'me' : 'partner',
            myScore: isHost ? hostScore : partnerScore,
            partnerScore: isHost ? partnerScore : hostScore,
            myLine: isHost ? hostLine : partnerLine,
            partnerLine: isHost ? partnerLine : hostLine
          });
        },

        handleDailyReset: (newSeed: string) => {
          const state = get();
          const card = generateDailyCard(newSeed);
          set({
            dailySeed: newSeed, dailyCard: card,
            phase: state.isPaired ? 'selecting' : 'waiting',
            myLine: null, partnerLine: null,
            marks: [], myScore: 0, partnerScore: 0,
            gameOver: false, winner: null,
            isMyTurnToPick: false, partnerHasSelected: false
          });
        },

        loadSnapshot: async () => {
          const state = get();
          if (!state.pairCode || !state.odId) return;
          const response = await fetchSnapshot(state.pairCode, state.odId);
          if (response.success && response.data) {
            set({ snapshot: response.data.snapshot });
          }
        },

        getMyLineIndices: () => {
          const state = get();
          return state.myLine ? getLineIndices(state.myLine) : [];
        }
      }),
      {
        name: 'duo-storage',
        partialize: (state) => ({
          pairCode: state.pairCode, odId: state.odId, odName: state.odName,
          partnerId: state.partnerId, partnerName: state.partnerName,
          isPaired: state.isPaired, isHost: state.isHost, phase: state.phase,
          myLine: state.myLine, dailySeed: state.dailySeed,
          marks: state.marks, myScore: state.myScore, partnerScore: state.partnerScore,
          gameOver: state.gameOver, winner: state.winner, partnerLine: state.partnerLine
        }),
        onRehydrateStorage: () => (state) => {
          if (!state) return;
          if (state.phase !== 'unpaired' && state.dailySeed) {
            if (hasNewDayStarted(state.dailySeed)) {
              useDuoStore.setState(initialState);
              return;
            }
          }
          if (state.phase !== 'unpaired' && !state.pairCode) {
            useDuoStore.setState(initialState);
          }
        }
      }
    )
  )
);

export function regenerateDailyCardIfNeeded(): void {
  const state = useDuoStore.getState();
  if (state.dailySeed && hasNewDayStarted(state.dailySeed)) {
    useDuoStore.getState().handleDailyReset(getTodayDateString());
    return;
  }
  if (state.dailySeed && state.dailyCard.length === 0) {
    const card = generateDailyCard(state.dailySeed);
    useDuoStore.setState({ dailyCard: card });
  }
  if (state.pairCode && state.odId && state.phase !== 'unpaired') {
    useConnectionStore.getState().connect(state.pairCode, state.odId);
  }
}
```

- [ ] **Step 2: Verify build**

Run: `cd /c/Users/Ryan/CC/Projects/Jargon && npm run build`
Expected: May still have errors in connectionStore and components. That's next.

- [ ] **Step 3: Commit**

```bash
git add src/stores/duoStore.ts
git commit -m "rebuild duoStore: server-authoritative scoring, new phases, snapshot"
```

---

## Task 10: Update connectionStore for New Protocol

**Files:**
- Modify: `src/stores/connectionStore.ts`

- [ ] **Step 1: Rewrite WebSocket message handler**

Replace `handleWebSocketMessage` function:

```typescript
function handleWebSocketMessage(message: DuoWebSocketMessage): void {
  const duoStore = useDuoStore.getState();

  switch (message.type) {
    case DUO_MESSAGE_TYPES.CONNECTED:
      if (message.isMyTurnToPick) {
        useDuoStore.setState({ isMyTurnToPick: true });
      }
      break;

    case DUO_MESSAGE_TYPES.PARTNER_JOINED:
      if (message.partnerId && message.partnerName) {
        duoStore.handlePartnerJoined({ id: message.partnerId, name: message.partnerName });
      }
      break;

    case DUO_MESSAGE_TYPES.PARTNER_LEFT:
      duoStore.handlePartnerLeft();
      break;

    case DUO_MESSAGE_TYPES.YOUR_TURN_TO_PICK:
      duoStore.handleYourTurnToPick();
      break;

    case DUO_MESSAGE_TYPES.BOTH_SELECTED:
      duoStore.handleBothSelected();
      break;

    case DUO_MESSAGE_TYPES.SQUARE_MARKED:
      if (typeof message.index === 'number' && message.markedBy &&
          typeof message.hostScore === 'number' && typeof message.partnerScore === 'number') {
        duoStore.handleSquareMarked(message.index, message.markedBy, message.hostScore, message.partnerScore);
      }
      break;

    case DUO_MESSAGE_TYPES.SQUARE_UNMARKED:
      if (typeof message.index === 'number' &&
          typeof message.hostScore === 'number' && typeof message.partnerScore === 'number') {
        duoStore.handleSquareUnmarked(message.index, message.hostScore, message.partnerScore);
      }
      break;

    case DUO_MESSAGE_TYPES.GAME_OVER:
      if (message.winner && typeof message.hostScore === 'number' && typeof message.partnerScore === 'number' &&
          message.hostLine && message.partnerLine) {
        duoStore.handleGameOver(message.winner, message.hostScore, message.partnerScore, message.hostLine, message.partnerLine);
      }
      break;

    case DUO_MESSAGE_TYPES.DAILY_RESET:
      if (message.newSeed) {
        duoStore.handleDailyReset(message.newSeed);
      }
      break;

    default:
      break;
  }
}
```

- [ ] **Step 2: Rewrite polling handler**

Replace `handlePollingUpdate` function:

```typescript
function handlePollingUpdate(state: DuoStateUpdate): void {
  const duoState = useDuoStore.getState();

  // Phase change
  if (state.phase !== duoState.phase) {
    useDuoStore.setState({ phase: state.phase as DuoPhase });
  }

  // Pairing
  if (state.isPaired && !duoState.isPaired && state.partnerName) {
    useDuoStore.setState({ partnerName: state.partnerName, isPaired: true });
  }

  // Selection state
  if (state.phase === 'selecting') {
    useDuoStore.setState({
      isMyTurnToPick: state.isMyTurnToPick ?? false,
      partnerHasSelected: state.partnerHasSelected ?? false,
      myLine: state.myLine ?? duoState.myLine
    });
  }

  // Playing / finished state
  if (state.phase === 'playing' || state.phase === 'finished') {
    const marks = (state.marks || []).map(m => ({ index: m.index, markedBy: m.markedBy }));
    let dailyCard = duoState.dailyCard;
    if (state.card && dailyCard.length === 0) {
      dailyCard = state.card.map((text, i) => ({ id: `square-${i}`, text, isMarked: false }));
    }
    useDuoStore.setState({
      myLine: state.myLine ?? duoState.myLine,
      marks,
      myScore: state.myScore,
      partnerScore: state.partnerScore,
      dailyCard
    });

    if (state.phase === 'finished') {
      useDuoStore.setState({
        partnerLine: state.partnerLine ?? null,
        winner: state.winner ?? null,
        gameOver: true
      });
    }
  }

  // Daily reset
  if (state.dailySeed !== duoState.dailySeed && duoState.dailySeed) {
    duoState.handleDailyReset(state.dailySeed);
  }
}
```

- [ ] **Step 3: Verify build**

Run: `cd /c/Users/Ryan/CC/Projects/Jargon && npm run build`
Expected: Errors now only in components (App.tsx, BingoCard, etc.).

- [ ] **Step 4: Commit**

```bash
git add src/stores/connectionStore.ts
git commit -m "update connectionStore: new message handlers for redesigned protocol"
```

---

## Task 11: Update LineSelector for Sequential Turns

**Files:**
- Modify: `src/components/bingo/LineSelector.tsx`

- [ ] **Step 1: Update LineSelector props and UI**

Replace the component:

```tsx
import { useState } from 'react';
import type { LineSelection } from '../../stores/duoStore';
import { getLineIndices } from '../../lib/dailyCard';

interface LineSelectorProps {
  onSelect: (line: LineSelection) => void;
  selectedLine?: LineSelection | null;
  isMyTurn: boolean;
  partnerHasSelected: boolean;
  disabled?: boolean;
}

const ALL_LINES: LineSelection[] = [
  { type: 'row', index: 0 }, { type: 'row', index: 1 }, { type: 'row', index: 2 },
  { type: 'row', index: 3 }, { type: 'row', index: 4 },
  { type: 'col', index: 0 }, { type: 'col', index: 1 }, { type: 'col', index: 2 },
  { type: 'col', index: 3 }, { type: 'col', index: 4 },
  { type: 'diag', index: 0 }, { type: 'diag', index: 1 }
];

function getLineName(line: LineSelection): string {
  switch (line.type) {
    case 'row': return `Row ${line.index + 1}`;
    case 'col': return `Column ${line.index + 1}`;
    case 'diag': return line.index === 0 ? 'Diagonal ↘' : 'Diagonal ↙';
  }
}

export function LineSelector({ onSelect, selectedLine, isMyTurn, partnerHasSelected, disabled = false }: LineSelectorProps) {
  const [hoveredLine, setHoveredLine] = useState<LineSelection | null>(null);
  const highlightedIndices = hoveredLine ? getLineIndices(hoveredLine) : [];
  const selectedIndices = selectedLine ? getLineIndices(selectedLine) : [];

  const canPick = isMyTurn && !selectedLine && !disabled;

  const handleLineClick = (line: LineSelection) => {
    if (!canPick) return;
    onSelect(line);
  };

  const renderCell = (index: number) => {
    const isHighlighted = highlightedIndices.includes(index);
    const isSelected = selectedIndices.includes(index);
    return (
      <div key={index} className={`aspect-square rounded-lg border-2 transition-all duration-150
        ${isSelected ? 'bg-cyan-500/30 border-cyan-500'
          : isHighlighted ? 'bg-cyan-500/20 border-cyan-500/50'
          : 'bg-apple-darkest border-apple-border'}`}
      />
    );
  };

  const renderLineButton = (line: LineSelection) => {
    const isSelected = selectedLine && line.type === selectedLine.type && line.index === selectedLine.index;
    const isHovered = hoveredLine && line.type === hoveredLine.type && line.index === hoveredLine.index;
    return (
      <button
        key={`${line.type}-${line.index}`}
        onClick={() => handleLineClick(line)}
        onMouseEnter={() => canPick && setHoveredLine(line)}
        onMouseLeave={() => setHoveredLine(null)}
        disabled={!canPick}
        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all
          ${isSelected ? 'bg-cyan-500 text-white'
            : isHovered ? 'bg-cyan-500/20 text-cyan-400'
            : 'bg-apple-darkest text-apple-secondary hover:bg-apple-hover hover:text-apple-text'}
          ${!canPick ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {getLineName(line)}
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-apple-text mb-2">Pick Your Line</h2>
        <p className="text-apple-secondary text-sm">
          {selectedLine
            ? 'Waiting for partner to pick...'
            : isMyTurn
            ? 'Your turn — choose a row, column, or diagonal.'
            : partnerHasSelected
            ? 'Loading...'
            : 'Waiting for partner to pick first...'}
        </p>
      </div>

      <div className="max-w-xs mx-auto">
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: 25 }, (_, i) => renderCell(i))}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-xs font-medium text-apple-secondary uppercase tracking-wider mb-2">Rows</h3>
          <div className="flex flex-wrap gap-2">
            {ALL_LINES.filter(l => l.type === 'row').map(renderLineButton)}
          </div>
        </div>
        <div>
          <h3 className="text-xs font-medium text-apple-secondary uppercase tracking-wider mb-2">Columns</h3>
          <div className="flex flex-wrap gap-2">
            {ALL_LINES.filter(l => l.type === 'col').map(renderLineButton)}
          </div>
        </div>
        <div>
          <h3 className="text-xs font-medium text-apple-secondary uppercase tracking-wider mb-2">Diagonals</h3>
          <div className="flex flex-wrap gap-2">
            {ALL_LINES.filter(l => l.type === 'diag').map(renderLineButton)}
          </div>
        </div>
      </div>

      {selectedLine && (
        <div className="text-center p-4 bg-cyan-500/10 rounded-lg border border-cyan-500/30">
          <p className="text-cyan-400 font-medium">You selected: {getLineName(selectedLine)}</p>
          <p className="text-apple-secondary text-sm mt-1">Waiting for partner...</p>
        </div>
      )}
    </div>
  );
}

export default LineSelector;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/bingo/LineSelector.tsx
git commit -m "update LineSelector: sequential turn-based picking"
```

---

## Task 12: Update BingoCard for Attributed Marks

**Files:**
- Modify: `src/components/bingo/BingoCard.tsx`

- [ ] **Step 1: Update BingoCard props and rendering**

Replace the component to use attributed marks instead of boolean array:

```tsx
import { useCallback, useRef } from 'react';
import type { BingoSquare } from '../../types';

interface Mark {
  index: number;
  markedBy: string;
}

interface BingoCardProps {
  squares: BingoSquare[];
  onSquareClick: (index: number) => void;
  myPlayerId: string;
  marks: Mark[];
  myLineIndices: number[];
  phase: 'playing' | 'finished';
  partnerLineIndices?: number[]; // only in finished phase
}

export function BingoCard({ squares, onSquareClick, myPlayerId, marks, myLineIndices, phase, partnerLineIndices = [] }: BingoCardProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  const getMarkFor = (index: number): Mark | undefined => marks.find(m => m.index === index);

  const getSquareClasses = (index: number) => {
    const mark = getMarkFor(index);
    const isMyLine = myLineIndices.includes(index);
    const isPartnerLine = phase === 'finished' && partnerLineIndices.includes(index);
    let classes = 'bingo-square';

    // Line indicators
    if (isMyLine && isPartnerLine) {
      classes += ' ring-2 ring-purple-500 bg-purple-900/20';
    } else if (isMyLine) {
      classes += ' ring-1 ring-cyan-500/40 bg-cyan-900/10';
    } else if (isPartnerLine) {
      classes += ' ring-2 ring-orange-500 bg-orange-900/20';
    }

    // Mark colors
    if (mark) {
      if (mark.markedBy === myPlayerId) {
        classes += ' marked-mine';
      } else {
        classes += ' marked-partner';
      }
    }

    return classes;
  };

  const handleKeyDown = useCallback((event: React.KeyboardEvent, index: number) => {
    const gridSize = 5;
    let newIndex = index;
    switch (event.key) {
      case 'ArrowUp': event.preventDefault(); newIndex = Math.max(0, index - gridSize); break;
      case 'ArrowDown': event.preventDefault(); newIndex = Math.min(24, index + gridSize); break;
      case 'ArrowLeft': event.preventDefault(); if (index % gridSize > 0) newIndex = index - 1; break;
      case 'ArrowRight': event.preventDefault(); if (index % gridSize < gridSize - 1) newIndex = index + 1; break;
      case 'Enter': case ' ': event.preventDefault(); onSquareClick(index); return;
      default: return;
    }
    const el = document.querySelector(`button[data-square-index="${newIndex}"]`) as HTMLButtonElement;
    el?.focus();
  }, [onSquareClick]);

  return (
    <div className="apple-panel p-6 max-w-2xl mx-auto">
      <div className="bingo-header">
        {['B', 'I', 'N', 'G', 'O'].map(letter => (
          <div key={letter} className="bingo-letter">{letter}</div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-4 mb-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-cyan-500/60"></div>
          <span className="text-cyan-400">Your marks</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-orange-500/60"></div>
          <span className="text-orange-400">Partner marks</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded ring-1 ring-cyan-500/40"></div>
          <span className="text-apple-tertiary">Your line</span>
        </div>
      </div>

      <div className="bingo-grid" ref={gridRef} role="grid" aria-label="Jargon Card">
        {squares.map((square, index) => {
          const mark = getMarkFor(index);
          return (
            <button
              key={square.id}
              data-square-index={index}
              onClick={() => onSquareClick(index)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={getSquareClasses(index)}
              role="gridcell"
              aria-pressed={!!mark}
              tabIndex={index === 0 ? 0 : -1}
            >
              {mark && (
                <div className={`absolute top-1 right-1 z-10 w-5 h-5 rounded-full flex items-center justify-center shadow-lg
                  ${mark.markedBy === myPlayerId ? 'bg-cyan-500' : 'bg-orange-500'}`}>
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
              <span className="relative z-0 pointer-events-none">{square.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/bingo/BingoCard.tsx
git commit -m "update BingoCard: color-coded attributed marks, subtle line indicator"
```

---

## Task 13: Update DuoScoreboard

**Files:**
- Modify: `src/components/bingo/DuoScoreboard.tsx`

- [ ] **Step 1: Rewrite for new scoring model**

```tsx
import { useDuoStore } from '../../stores/duoStore';

export function DuoScoreboard() {
  const { phase, odName, partnerName, myScore, partnerScore, dailySeed } = useDuoStore();

  if (phase !== 'playing' && phase !== 'finished') return null;

  const leader = myScore > partnerScore ? 'you' : partnerScore > myScore ? 'partner' : 'tie';

  return (
    <div className="apple-panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-apple-text">Duo Match</h2>
        <span className="text-xs text-apple-tertiary font-mono">{dailySeed}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded-lg p-3 ${leader === 'you' ? 'bg-cyan-500/20 ring-2 ring-cyan-500' : 'bg-apple-darkest'}`}>
          <span className="text-cyan-400 font-medium text-sm">{odName || 'You'}</span>
          <div className="text-3xl font-bold text-cyan-400">{myScore}<span className="text-lg text-cyan-400/50">/5</span></div>
        </div>
        <div className={`rounded-lg p-3 ${leader === 'partner' ? 'bg-orange-500/20 ring-2 ring-orange-500' : 'bg-apple-darkest'}`}>
          <span className="text-orange-400 font-medium text-sm">{partnerName || 'Partner'}</span>
          <div className="text-3xl font-bold text-orange-400">{partnerScore}<span className="text-lg text-orange-400/50">/5</span></div>
        </div>
      </div>

      <div className="text-xs text-apple-tertiary text-center">
        Score by marking your partner's secret line squares
      </div>
    </div>
  );
}

export default DuoScoreboard;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/bingo/DuoScoreboard.tsx
git commit -m "update DuoScoreboard: new scoring display with /5 range"
```

---

## Task 14: Create GameOverScreen Component

**Files:**
- Create: `src/components/bingo/GameOverScreen.tsx`

- [ ] **Step 1: Create GameOverScreen**

```tsx
import { useState, useEffect } from 'react';
import { useDuoStore } from '../../stores/duoStore';
import { ShareCard } from './ShareCard';

export function GameOverScreen() {
  const { winner, myScore, partnerScore, odName, partnerName, myLine, partnerLine, dailySeed } = useDuoStore();
  const [countdown, setCountdown] = useState('');
  const [showShare, setShowShare] = useState(false);

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      const diff = tomorrow.getTime() - now.getTime();
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setCountdown(`${hours}h ${minutes}m ${seconds}s`);
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="text-center py-8 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-apple-text">
          {winner === 'me' ? 'You Win!' : winner === 'partner' ? `${partnerName} Wins!` : "It's a Tie!"}
        </h2>
        <p className="text-apple-secondary mt-1">{dailySeed}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
        <div className={`rounded-lg p-4 ${winner === 'me' ? 'bg-cyan-500/20 ring-2 ring-cyan-500' : 'bg-apple-darkest'}`}>
          <span className="text-cyan-400 text-sm">{odName || 'You'}</span>
          <div className="text-4xl font-bold text-cyan-400">{myScore}</div>
        </div>
        <div className={`rounded-lg p-4 ${winner === 'partner' ? 'bg-orange-500/20 ring-2 ring-orange-500' : 'bg-apple-darkest'}`}>
          <span className="text-orange-400 text-sm">{partnerName || 'Partner'}</span>
          <div className="text-4xl font-bold text-orange-400">{partnerScore}</div>
        </div>
      </div>

      {winner === 'me' && myScore === 5 && (
        <div className="text-yellow-400 font-bold text-lg">BINGO!</div>
      )}

      <button
        onClick={() => setShowShare(true)}
        className="px-6 py-3 bg-apple-accent hover:bg-apple-accent-hover text-white rounded-lg font-medium transition-colors"
      >
        Share Result
      </button>

      <div className="text-apple-tertiary text-sm">
        Next card in <span className="font-mono text-apple-text">{countdown}</span>
      </div>

      {showShare && myLine && partnerLine && (
        <ShareCard
          date={dailySeed}
          myScore={myScore}
          partnerScore={partnerScore}
          winner={winner}
          myLine={myLine}
          partnerLine={partnerLine}
          marks={useDuoStore.getState().marks}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}

export default GameOverScreen;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/bingo/GameOverScreen.tsx
git commit -m "create GameOverScreen: results, countdown, share button"
```

---

## Task 15: Create ShareCard Component

**Files:**
- Create: `src/components/bingo/ShareCard.tsx`

- [ ] **Step 1: Create ShareCard**

```tsx
import type { LineSelection } from '../../stores/duoStore';
import { getLineIndices } from '../../lib/dailyCard';
import { showGameToast } from '../shared/ToastNotification';

interface ShareCardProps {
  date: string;
  myScore: number;
  partnerScore: number;
  winner: 'me' | 'partner' | 'tie' | null;
  myLine: LineSelection;
  partnerLine: LineSelection;
  marks: Array<{ index: number; markedBy: string }>;
  onClose: () => void;
}

function generateEmojiGrid(myLine: LineSelection, partnerLine: LineSelection): string {
  const myIndices = new Set(getLineIndices(myLine));
  const partnerIndices = new Set(getLineIndices(partnerLine));

  const rows: string[] = [];
  for (let row = 0; row < 5; row++) {
    let rowStr = '';
    for (let col = 0; col < 5; col++) {
      const idx = row * 5 + col;
      const isMy = myIndices.has(idx);
      const isPartner = partnerIndices.has(idx);
      if (isMy && isPartner) {
        rowStr += '🟪';
      } else if (isMy) {
        rowStr += '🟦';
      } else if (isPartner) {
        rowStr += '🟧';
      } else {
        rowStr += '⬜';
      }
    }
    rows.push(rowStr);
  }
  return rows.join('\n');
}

export function ShareCard({ date, myScore, partnerScore, winner, myLine, partnerLine, onClose }: ShareCardProps) {
  const trophy = winner === 'me' ? ' 🏆' : winner === 'partner' ? '' : ' 🤝';
  const grid = generateEmojiGrid(myLine, partnerLine);

  const shareText = `Jargon — ${new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
${myScore} – ${partnerScore}${trophy}

${grid}

playjargon.com`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareText);
    showGameToast('Copied!', 'Share card copied to clipboard', 'success');
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-apple-dark rounded-xl p-6 max-w-sm w-full space-y-4" onClick={e => e.stopPropagation()}>
        <pre className="text-center text-sm leading-relaxed whitespace-pre font-mono text-apple-text">{shareText}</pre>
        <div className="flex gap-3">
          <button onClick={handleCopy} className="flex-1 px-4 py-2 bg-apple-accent hover:bg-apple-accent-hover text-white rounded-lg font-medium">
            Copy to Clipboard
          </button>
          <button onClick={onClose} className="px-4 py-2 bg-apple-darkest hover:bg-apple-hover text-apple-text rounded-lg">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/bingo/ShareCard.tsx
git commit -m "create ShareCard: emoji grid generation + clipboard copy"
```

---

## Task 16: Wire Everything in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Update App.tsx for new phases, components, and props**

This is a large change. Key modifications:
- Add `finished` phase rendering with `GameOverScreen`
- Update `handleSquareClick` to pass index directly (not squareId)
- Update `LineSelector` props (isMyTurn, partnerHasSelected instead of takenLine)
- Update `BingoCard` props (marks, myPlayerId instead of markedSquares/boolean)
- Remove old bingo modal logic (game over is handled by `finished` phase)
- Hide solo mode from mode selector (built but not visible)
- Load snapshot on mount

Replace the entire `App.tsx` with the updated version that:
- Uses `marks` array instead of `markedSquares` boolean array
- Passes `phase`, `marks`, `myPlayerId` to BingoCard
- Renders `GameOverScreen` when `phase === 'finished'`
- Updates `LineSelector` call to pass `isMyTurn` and `partnerHasSelected`
- Calls `loadSnapshot` on duo mode mount
- Updates sidebar scoring text to match new model
- Removes `BingoModal` import and usage (replaced by GameOverScreen)

The full replacement code is large — the implementing agent should read the current App.tsx and modify it according to the changes listed above. Key prop changes:

```tsx
// LineSelector (in selecting phase):
<LineSelector
  onSelect={handleLineSelect}
  selectedLine={myLine}
  isMyTurn={isMyTurnToPick}
  partnerHasSelected={partnerHasSelected}
  disabled={!!myLine}
/>

// BingoCard (in playing phase):
<BingoCard
  squares={dailyCard}
  onSquareClick={handleSquareClick}
  myPlayerId={odId || ''}
  marks={marks}
  myLineIndices={getMyLineIndices()}
  phase="playing"
/>

// GameOverScreen (in finished phase):
<GameOverScreen />

// handleSquareClick becomes:
const handleSquareClick = async (index: number) => {
  if (phase !== 'playing') return;
  const result = await markSquare(index);
  // hit feedback could trigger haptic here
};
```

- [ ] **Step 2: Verify build**

Run: `cd /c/Users/Ryan/CC/Projects/Jargon && npm run build`
Expected: Build passes.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "wire App.tsx: new phases, attributed marks, GameOverScreen, hide solo"
```

---

## Task 17: End-to-End Verification

- [ ] **Step 1: Deploy worker**

Run: `cd /c/Users/Ryan/CC/Projects/Jargon && npx wrangler deploy`

- [ ] **Step 2: Start dev server**

Run: `cd /c/Users/Ryan/CC/Projects/Jargon && npm run dev`

- [ ] **Step 3: Two-tab test**

Open two browser tabs. In tab 1: create game, get code. In tab 2: join with code.
Verify:
- Sequential line picking works (one player picks, then the other)
- Marks show in correct colors
- Scores update when hitting opponent's line squares
- Hit returns `hit: true` for marks on opponent's line
- Toggling (unmark) works for own marks only
- BINGO triggers game over at score 5

- [ ] **Step 4: Test daily reset**

Use wrangler dev with a modified UTC date to test reset behavior. Verify snapshot is stored and retrievable.

- [ ] **Step 5: Fix any issues found**

Address bugs discovered during testing.

- [ ] **Step 6: Commit fixes**

```bash
git add -A
git commit -m "fix: e2e test issues from duo mode redesign"
```

---

## Summary

17 tasks total. Estimated scope:
- Tasks 1-7: Backend rebuild (worker.js)
- Tasks 8-10: Frontend stores + types
- Tasks 11-15: UI components
- Task 16: Wiring
- Task 17: E2E verification

Each task is self-contained and committable. Server is always source of truth for scoring. Client marks optimistically, server confirms.
