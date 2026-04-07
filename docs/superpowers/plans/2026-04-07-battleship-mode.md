# Battleship Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace bingo line selection with battleship-style 5-square hidden placement. Scoring becomes hit-based (opponent marks on your hidden squares).

**Architecture:** Backend selection endpoint changes from accepting a `LineSelection` to accepting `number[]` (5 indices). Scoring changes from `marks + completedLines*3` to counting opponent marks on your hidden squares. Frontend replaces `LineSelector` with `SquareSelector`, updates scoreboard/game-over/share to show hits instead of points.

**Tech Stack:** React 19, TypeScript, Zustand, Cloudflare Workers + Durable Objects, Vitest

---

### Task 1: Backend — Update Schema & Selection Logic

**Files:**
- Modify: `worker.js:402-450` (schema), `worker.js:452-533` (helpers), `worker.js:714-801` (selectLine)

- [ ] **Step 1: Update DB schema**

In `worker.js`, replace the `room` table schema. Change `host_line TEXT` and `partner_line TEXT` to `host_squares TEXT` and `partner_squares TEXT`. Remove `host_first_pick` column (no longer needed — simultaneous selection).

```js
initializeSchema() {
  this.sql.exec(`
    CREATE TABLE IF NOT EXISTS room (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      code TEXT,
      host_id TEXT,
      host_name TEXT,
      partner_id TEXT,
      partner_name TEXT,
      phase TEXT DEFAULT 'waiting',
      host_squares TEXT,
      partner_squares TEXT,
      host_ready INTEGER DEFAULT 0,
      partner_ready INTEGER DEFAULT 0,
      daily_seed TEXT,
      created_at INTEGER,
      last_activity INTEGER
    );
    CREATE TABLE IF NOT EXISTS marks (
      idx INTEGER PRIMARY KEY CHECK (idx >= 0 AND idx <= 24),
      marked_by TEXT NOT NULL,
      marked_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS snapshots (
      date TEXT PRIMARY KEY,
      host_id TEXT,
      host_name TEXT,
      partner_id TEXT,
      partner_name TEXT,
      host_hits INTEGER,
      partner_hits INTEGER,
      host_marks INTEGER,
      partner_marks INTEGER,
      winner TEXT,
      host_squares TEXT,
      partner_squares TEXT,
      marks_json TEXT
    );
  `);
}
```

- [ ] **Step 2: Update `getRoom()` helper**

Change line/pick parsing to squares parsing:

```js
getRoom() {
  const row = this.sql.exec('SELECT * FROM room WHERE id = 1').toArray()[0];
  if (!row) return null;
  return {
    ...row,
    host_squares: row.host_squares ? JSON.parse(row.host_squares) : null,
    partner_squares: row.partner_squares ? JSON.parse(row.partner_squares) : null,
    host_ready: !!row.host_ready,
    partner_ready: !!row.partner_ready
  };
}
```

- [ ] **Step 3: Update `updateRoom()` helper**

Change the JSON serialization keys from `host_line`/`partner_line` to `host_squares`/`partner_squares`:

```js
updateRoom(fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const sets = [];
  const vals = [];
  for (const key of keys) {
    sets.push(`${key} = ?`);
    const val = fields[key];
    if (key === 'host_squares' || key === 'partner_squares') {
      vals.push(val !== null && val !== undefined ? JSON.stringify(val) : null);
    } else if (typeof val === 'boolean') {
      vals.push(val ? 1 : 0);
    } else {
      vals.push(val);
    }
  }
  this.sql.exec(`UPDATE room SET ${sets.join(', ')} WHERE id = 1`, ...vals);
}
```

- [ ] **Step 4: Replace scoring helpers**

Remove `countCompletedLines`, `computeScore`, `checkBonusBingo`, `computeScores`, `isPickTurn`. Replace with:

```js
// Count how many of opponent's hidden squares have been marked (by anyone except the owner)
computeHits(playerId, room) {
  const isHost = playerId === room.host_id;
  const opponentSquares = isHost ? room.partner_squares : room.host_squares;
  if (!opponentSquares) return 0;
  const marks = this.getMarks();
  // Only count marks NOT made by the opponent (opponent marking own square doesn't count)
  const opponentId = isHost ? room.partner_id : room.host_id;
  return opponentSquares.filter(idx =>
    marks.some(m => m.idx === idx && m.marked_by !== opponentId)
  ).length;
}

// Count total marks by a player
countMarks(playerId) {
  const marks = this.getMarks();
  return marks.filter(m => m.marked_by === playerId).length;
}

// Check if all 5 of opponent's squares are hit
checkAllHit(playerId, room) {
  return this.computeHits(playerId, room) === 5;
}

computeScores(room) {
  if (!room.host_squares || !room.partner_squares) return { hostHits: 0, partnerHits: 0, hostMarks: 0, partnerMarks: 0 };
  return {
    hostHits: this.computeHits(room.host_id, room),
    partnerHits: this.computeHits(room.partner_id, room),
    hostMarks: this.countMarks(room.host_id),
    partnerMarks: this.countMarks(room.partner_id)
  };
}
```

- [ ] **Step 5: Replace `selectLine` with `selectSquares`**

```js
async selectSquares(request) {
  const playerId = request.headers.get('X-Player-ID');
  const { squares } = await request.json();
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

  // Validate: exactly 5 unique indices 0-24
  if (!Array.isArray(squares) || squares.length !== 5) {
    return new Response(JSON.stringify({ error: 'Must select exactly 5 squares' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }
  const unique = new Set(squares);
  if (unique.size !== 5 || squares.some(s => typeof s !== 'number' || s < 0 || s > 24)) {
    return new Response(JSON.stringify({ error: 'Invalid square selection' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  // Already selected?
  const readyField = isHost ? 'host_ready' : 'partner_ready';
  if (isHost ? room.host_ready : room.partner_ready) {
    return new Response(JSON.stringify({ error: 'Already submitted selection' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  // Store selection + mark ready
  const squaresField = isHost ? 'host_squares' : 'partner_squares';
  this.updateRoom({ [squaresField]: squares, [readyField]: true, last_activity: Date.now() });

  // Notify partner that this player is ready
  const partnerId = isHost ? room.partner_id : room.host_id;
  this.sendToPlayer(partnerId, { type: 'partner_ready' });

  // Check if both ready
  const updatedRoom = this.getRoom();
  if (updatedRoom.host_ready && updatedRoom.partner_ready) {
    this.updateRoom({ phase: 'playing' });
    this.broadcastToRoom({ type: 'both_selected', phase: 'playing' });

    return new Response(JSON.stringify({ success: true, phase: 'playing' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ success: true, waiting: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
```

- [ ] **Step 6: Update route in `fetch()` and main worker**

In `BingoRoom.fetch()`, change the route:
```js
if (url.pathname === '/duo/select') return await this.selectSquares(request);
```

In the main worker `fetch()`, update the select endpoint body forwarding — no change needed since it already passes `body` through.

- [ ] **Step 7: Update `createDuoGame`**

Remove `host_first_pick` from the INSERT statement:

```js
this.sql.exec(
  `INSERT OR REPLACE INTO room (id, code, host_id, host_name, partner_id, partner_name, phase, host_squares, partner_squares, host_ready, partner_ready, daily_seed, created_at, last_activity)
   VALUES (1, ?, ?, ?, NULL, NULL, 'waiting', NULL, NULL, 0, 0, ?, ?, ?)`,
  roomCode, hostId, playerName, dailySeed, now, now
);
```

- [ ] **Step 8: Update `joinDuoGame`**

Remove `isPickTurn` calls from partner_joined messages. Replace with simpler notification (no turn info needed for simultaneous selection):

In the partner_joined broadcast, remove `isMyTurnToPick` field:
```js
this.sendToPlayer(room.host_id, {
  type: 'partner_joined',
  partnerId,
  partnerName: playerName
});
```

- [ ] **Step 9: Update `leaveGame`**

Change field resets from `host_line`/`partner_line` to `host_squares`/`partner_squares` + reset ready flags:

```js
// Partner leaves = clear marks, reset partner fields
this.sql.exec('DELETE FROM marks');
this.updateRoom({
  partner_id: null,
  partner_name: null,
  partner_squares: null,
  host_squares: null,
  host_ready: false,
  partner_ready: false,
  phase: 'waiting',
  last_activity: Date.now()
});
```

- [ ] **Step 10: Commit**

```bash
cd /c/Users/Ryan/CC/Projects/Jargon && git add worker.js && git commit -m "backend: replace bingo lines w/ battleship squares selection + hit scoring"
```

---

### Task 2: Backend — Update Mark, State, Snapshot, Reset

**Files:**
- Modify: `worker.js:803-953` (markSquare), `worker.js:955-1028` (getState), `worker.js:1030-1078` (daily reset), `worker.js:1080-1120` (snapshot), `worker.js:1122-1170` (WebSocket handler)

- [ ] **Step 1: Update `markSquare` to use hit detection**

Replace `checkBonusBingo` with `checkAllHit`. Replace score computation with hit computation. Change response fields from `myScore`/`partnerScore` to `myHits`/`partnerHits` + `myMarks`/`partnerMarks`:

```js
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
    return new Response(JSON.stringify({ error: 'Invalid square index' }), {
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

  // Check if already marked
  const existing = this.sql.exec('SELECT marked_by FROM marks WHERE idx = ?', index).toArray()[0];

  if (existing) {
    if (existing.marked_by !== playerId) {
      return new Response(JSON.stringify({ error: 'Only the original marker can unmark' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    this.sql.exec('DELETE FROM marks WHERE idx = ?', index);
    const scores = this.computeScores(room);

    // Check if this unmark was on opponent's hidden square
    const opponentSquares = isHost ? room.partner_squares : room.host_squares;
    const wasHit = opponentSquares && opponentSquares.includes(index);

    this.broadcastToRoom({
      type: 'square_unmarked',
      index,
      markedBy: playerId,
      hostHits: scores.hostHits,
      partnerHits: scores.partnerHits,
      hostMarks: scores.hostMarks,
      partnerMarks: scores.partnerMarks
    });

    return new Response(JSON.stringify({
      success: true,
      myHits: isHost ? scores.hostHits : scores.partnerHits,
      partnerHits: isHost ? scores.partnerHits : scores.hostHits,
      gameOver: false,
      unmarked: true
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Mark the square
  this.sql.exec(
    'INSERT INTO marks (idx, marked_by, marked_at) VALUES (?, ?, ?)',
    index, playerId, Date.now()
  );

  const scores = this.computeScores(room);
  const myHits = isHost ? scores.hostHits : scores.partnerHits;
  const theirHits = isHost ? scores.partnerHits : scores.hostHits;

  // Check if this mark is a hit on opponent's hidden squares
  const opponentSquares = isHost ? room.partner_squares : room.host_squares;
  const isHit = opponentSquares && opponentSquares.includes(index);

  // Check if all 5 hit (instant win)
  const allHit = this.checkAllHit(playerId, room);

  // Broadcast the mark with hit info
  this.broadcastToRoom({
    type: 'square_marked',
    index,
    markedBy: playerId,
    isHit: !!isHit,
    hostHits: scores.hostHits,
    partnerHits: scores.partnerHits,
    hostMarks: scores.hostMarks,
    partnerMarks: scores.partnerMarks
  });

  if (allHit) {
    this.updateRoom({ phase: 'finished', last_activity: Date.now() });

    const winnerRole = isHost ? 'host' : 'partner';
    const allMarks = this.getMarks();
    this.sql.exec(
      `INSERT OR REPLACE INTO snapshots (date, host_id, host_name, partner_id, partner_name, host_hits, partner_hits, host_marks, partner_marks, winner, host_squares, partner_squares, marks_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      room.daily_seed, room.host_id, room.host_name, room.partner_id, room.partner_name,
      scores.hostHits, scores.partnerHits, scores.hostMarks, scores.partnerMarks,
      isHost ? room.host_name : room.partner_name,
      JSON.stringify(room.host_squares), JSON.stringify(room.partner_squares),
      JSON.stringify(allMarks)
    );

    this.broadcastToRoom({
      type: 'game_over',
      winner: winnerRole,
      hostHits: scores.hostHits,
      partnerHits: scores.partnerHits,
      hostMarks: scores.hostMarks,
      partnerMarks: scores.partnerMarks,
      hostSquares: room.host_squares,
      partnerSquares: room.partner_squares,
      allHit: true
    });

    return new Response(JSON.stringify({
      success: true,
      myHits,
      partnerHits: theirHits,
      gameOver: true,
      allHit: true,
      isHit: !!isHit
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  this.updateRoom({ last_activity: Date.now() });

  return new Response(JSON.stringify({
    success: true,
    myHits,
    partnerHits: theirHits,
    gameOver: false,
    isHit: !!isHit
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
```

- [ ] **Step 2: Update `getState`**

Replace score fields with hit fields. Replace line fields with squares fields. Update finished-phase winner logic to use hits then marks tiebreaker:

```js
async getState(request) {
  const playerId = request.headers.get('X-Player-ID');
  let room = this.getRoom();

  if (!room) {
    return new Response(JSON.stringify({ error: 'Room not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' }
    });
  }

  const currentDate = getTodayUTC();
  if (currentDate !== room.daily_seed) {
    this.performDailyReset(room, currentDate);
    room = this.getRoom();
  }

  const isHost = playerId === room.host_id;
  const marks = this.getMarks();
  const scores = this.computeScores(room);
  const card = generateDailyCard(room.daily_seed);

  const response = {
    code: room.code,
    phase: room.phase,
    dailySeed: room.daily_seed,
    isHost,
    hostName: room.host_name,
    partnerName: room.partner_name,
    isPaired: !!room.partner_id,
    marks: marks.map(m => ({ index: m.idx, markedBy: m.marked_by })),
    myHits: isHost ? scores.hostHits : scores.partnerHits,
    partnerHits: isHost ? scores.partnerHits : scores.hostHits,
    myMarks: isHost ? scores.hostMarks : scores.partnerMarks,
    partnerMarks: isHost ? scores.partnerMarks : scores.hostMarks,
    card
  };

  if (room.phase === 'selecting') {
    response.mySquares = isHost ? room.host_squares : room.partner_squares;
    response.myReady = isHost ? room.host_ready : room.partner_ready;
    response.partnerReady = isHost ? room.partner_ready : room.host_ready;
  }

  if (room.phase === 'playing') {
    response.mySquares = isHost ? room.host_squares : room.partner_squares;
  }

  if (room.phase === 'finished') {
    response.mySquares = isHost ? room.host_squares : room.partner_squares;
    response.partnerSquares = isHost ? room.partner_squares : room.host_squares;
    // Winner: most hits, tiebreaker: most total marks
    if (scores.hostHits > scores.partnerHits) {
      response.winner = 'host';
    } else if (scores.partnerHits > scores.hostHits) {
      response.winner = 'partner';
    } else if (scores.hostMarks > scores.partnerMarks) {
      response.winner = 'host';
    } else if (scores.partnerMarks > scores.hostMarks) {
      response.winner = 'partner';
    } else {
      response.winner = 'tie';
    }
  }

  return new Response(JSON.stringify(response), {
    headers: { 'Content-Type': 'application/json' }
  });
}
```

- [ ] **Step 3: Update `performDailyReset`**

Replace line references with squares. Update snapshot to use hits. Remove `host_first_pick`. Reset ready flags:

```js
performDailyReset(room, newSeed) {
  if ((room.phase === 'playing' || room.phase === 'finished') && room.host_squares && room.partner_squares) {
    const scores = this.computeScores(room);
    const allMarks = this.getMarks();
    let winner = null;

    if (this.checkAllHit(room.host_id, room)) {
      winner = room.host_name;
    } else if (this.checkAllHit(room.partner_id, room)) {
      winner = room.partner_name;
    } else if (scores.hostHits > scores.partnerHits) {
      winner = room.host_name;
    } else if (scores.partnerHits > scores.hostHits) {
      winner = room.partner_name;
    } else if (scores.hostMarks > scores.partnerMarks) {
      winner = room.host_name;
    } else if (scores.partnerMarks > scores.hostMarks) {
      winner = room.partner_name;
    }

    this.sql.exec(
      `INSERT OR IGNORE INTO snapshots (date, host_id, host_name, partner_id, partner_name, host_hits, partner_hits, host_marks, partner_marks, winner, host_squares, partner_squares, marks_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      room.daily_seed, room.host_id, room.host_name, room.partner_id, room.partner_name,
      scores.hostHits, scores.partnerHits, scores.hostMarks, scores.partnerMarks, winner,
      JSON.stringify(room.host_squares), JSON.stringify(room.partner_squares),
      JSON.stringify(allMarks)
    );
  }

  this.sql.exec('DELETE FROM marks');

  const newPhase = room.partner_id ? 'selecting' : 'waiting';
  this.updateRoom({
    daily_seed: newSeed,
    host_squares: null,
    partner_squares: null,
    host_ready: false,
    partner_ready: false,
    phase: newPhase,
    last_activity: Date.now()
  });

  this.broadcastToRoom({ type: 'daily_reset', dailySeed: newSeed });
}
```

- [ ] **Step 4: Update `getSnapshot`**

Replace line fields with squares fields, score with hits:

```js
async getSnapshot(request) {
  const playerId = request.headers.get('X-Player-ID');
  const room = this.getRoom();

  if (!room) {
    return new Response(JSON.stringify({ error: 'Room not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' }
    });
  }

  const now = new Date();
  now.setUTCDate(now.getUTCDate() - 1);
  const yesterday = now.toISOString().split('T')[0];

  const row = this.sql.exec('SELECT * FROM snapshots WHERE date = ?', yesterday).toArray()[0];
  if (!row) {
    return new Response(JSON.stringify({ snapshot: null }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const isHost = playerId === row.host_id;
  return new Response(JSON.stringify({
    snapshot: {
      date: row.date,
      myName: isHost ? row.host_name : row.partner_name,
      partnerName: isHost ? row.partner_name : row.host_name,
      myHits: isHost ? row.host_hits : row.partner_hits,
      partnerHits: isHost ? row.partner_hits : row.host_hits,
      myMarks: isHost ? row.host_marks : row.partner_marks,
      partnerMarks: isHost ? row.partner_marks : row.host_marks,
      winner: row.winner,
      mySquares: isHost ? JSON.parse(row.host_squares) : JSON.parse(row.partner_squares),
      partnerSquares: isHost ? JSON.parse(row.partner_squares) : JSON.parse(row.host_squares),
      marks: JSON.parse(row.marks_json)
    }
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
```

- [ ] **Step 5: Update WebSocket handler `connected` message**

Remove `isMyTurnToPick` from connected message. Add `myReady`/`partnerReady` for selecting phase:

```js
if (room.phase === 'selecting') {
  connectMsg.myReady = isHost ? room.host_ready : room.partner_ready;
  connectMsg.partnerReady = isHost ? room.partner_ready : room.host_ready;
}
```

- [ ] **Step 6: Remove dead code**

Delete these functions from `worker.js`:
- `getLineIndices` (lines 74-88)
- `ALL_LINES` (lines 91-97)
- `countCompletedLines` (lines 100-110)

- [ ] **Step 7: Commit**

```bash
cd /c/Users/Ryan/CC/Projects/Jargon && git add worker.js && git commit -m "backend: battleship mark/state/snapshot/reset + remove bingo line logic"
```

---

### Task 3: Frontend — Update Types & API Layer

**Files:**
- Modify: `src/stores/duoStore.ts:1-50` (types)
- Modify: `src/lib/api.ts` (API types + selectLine function)
- Modify: `src/lib/websocket.ts:7-30` (message interface)
- Modify: `src/lib/polling.ts:7-27` (state update interface)
- Modify: `src/lib/messageTypes.ts`

- [ ] **Step 1: Update `duoStore.ts` types**

Replace `LineSelection` with squares array. Replace score with hits. Remove turn-based selection fields:

```ts
// Replace LineSelection export and YesterdaySnapshot
// Remove: export interface LineSelection { ... }

// Mark entry — unchanged
export interface MarkEntry {
  index: number;
  markedBy: string;
}

// Game phase — unchanged
export type DuoPhase = 'unpaired' | 'waiting' | 'selecting' | 'playing' | 'finished';

// Yesterday snapshot — updated for battleship
export interface YesterdaySnapshot {
  date: string;
  mySquares: number[] | null;
  partnerSquares: number[] | null;
  marks: MarkEntry[];
  myHits: number;
  partnerHits: number;
  myMarks: number;
  partnerMarks: number;
  winner: string | null;
}
```

- [ ] **Step 2: Update `DuoState` interface**

```ts
interface DuoState {
  // Pairing — unchanged
  pairCode: string | null;
  odId: string | null;
  odName: string | null;
  partnerId: string | null;
  partnerName: string | null;
  isPaired: boolean;
  isHost: boolean;

  // Phase
  phase: DuoPhase;

  // Square Selection (battleship)
  mySquares: number[] | null;
  myReady: boolean;
  partnerReady: boolean;

  // Daily Card
  dailyCard: BingoSquare[];
  dailySeed: string;

  // Game State
  marks: MarkEntry[];
  myHits: number;
  partnerHits: number;
  gameOver: boolean;
  allHit: boolean;
  winner: 'me' | 'partner' | 'tie' | null;
  partnerSquares: number[] | null; // revealed in finished phase
  
  // Snapshot
  snapshot: YesterdaySnapshot | null;
}
```

- [ ] **Step 3: Update `DuoActions` interface**

```ts
interface DuoActions {
  createGame: (playerName: string) => Promise<{ success: boolean; code?: string; error?: string }>;
  joinGame: (code: string, playerName: string) => Promise<{ success: boolean; error?: string }>;
  leaveGame: () => void;

  // Square Selection (replaces selectLine)
  selectSquares: (squares: number[]) => Promise<{ success: boolean; error?: string }>;

  // Game Actions
  markSquare: (index: number) => Promise<void>;

  // Sync handlers
  syncState: (state: Partial<DuoState>) => void;
  handlePartnerJoined: (partner: { id: string; name: string }) => void;
  handlePartnerLeft: (roomDestroyed?: boolean) => void;
  handlePartnerReady: () => void;
  handleBothSelected: () => void;
  handleSquareMarked: (index: number, markedBy: string, isHit: boolean, myHits: number, partnerHits: number) => void;
  handleSquareUnmarked: (index: number, markedBy: string | undefined, myHits: number, partnerHits: number) => void;
  handleGameOver: (winner: string, myHits: number, partnerHits: number, myMarks: number, partnerMarks: number, hostSquares: number[], partnerSquaresRevealed: number[], allHit?: boolean) => void;
  handleDailyReset: (newSeed: string) => void;

  // Utilities
  checkDailyReset: () => boolean;
  loadSnapshot: () => Promise<void>;
}
```

- [ ] **Step 4: Update `api.ts`**

Replace `selectLine` function and types:

```ts
// Remove: import type { LineSelection } from '../stores/duoStore';

export interface DuoSelectResponse {
  success: boolean;
  waiting?: boolean;
  phase?: string;
  error?: string;
}

export interface DuoMarkResponse {
  success: boolean;
  myHits: number;
  partnerHits: number;
  gameOver: boolean;
  allHit?: boolean;
  isHit?: boolean;
  unmarked?: boolean;
}

export interface DuoSnapshotResponse {
  success: boolean;
  date: string;
  mySquares: number[] | null;
  partnerSquares: number[] | null;
  marks: Array<{ index: number; markedBy: string }>;
  myHits: number;
  partnerHits: number;
  myMarks: number;
  partnerMarks: number;
  winner: string | null;
}

// Replace selectLine with selectSquares
export async function selectSquares(roomCode: string, playerId: string, squares: number[]): Promise<ApiResponse<DuoSelectResponse>> {
  return apiRequest<DuoSelectResponse>(`/api/duo/${roomCode}/select`, {
    method: 'POST',
    headers: { 'X-Player-ID': playerId },
    body: JSON.stringify({ squares }),
  });
}
```

Remove the old `selectLine` function.

- [ ] **Step 5: Update `websocket.ts` message interface**

```ts
export interface DuoWebSocketMessage {
  type: string;
  // Partner joined
  partnerId?: string;
  partnerName?: string;
  // Square marked/unmarked
  index?: number;
  markedBy?: string;
  isHit?: boolean;
  hostHits?: number;
  partnerHits?: number;
  hostMarks?: number;
  partnerMarks?: number;
  // Game over
  winner?: string;
  hostSquares?: number[];
  partnerSquares?: number[];
  allHit?: boolean;
  // Daily reset
  newSeed?: string;
  // Connection state
  phase?: string;
  isHost?: boolean;
  hostName?: string;
  isPaired?: boolean;
  myReady?: boolean;
  partnerReady?: boolean;
}
```

Add new message type constants:
```ts
export const DUO_MESSAGE_TYPES = {
  CONNECTED: 'connected',
  PING: 'ping',
  PONG: 'pong',
  PARTNER_JOINED: 'partner_joined',
  PARTNER_LEFT: 'partner_left',
  PARTNER_READY: 'partner_ready',
  BOTH_SELECTED: 'both_selected',
  SQUARE_MARKED: 'square_marked',
  SQUARE_UNMARKED: 'square_unmarked',
  GAME_OVER: 'game_over',
  DAILY_RESET: 'daily_reset'
} as const;
```

- [ ] **Step 6: Update `polling.ts` state interface**

```ts
export interface DuoStateUpdate {
  code: string;
  phase: 'waiting' | 'selecting' | 'playing' | 'finished';
  dailySeed: string;
  isHost: boolean;
  hostName: string;
  partnerName: string | null;
  isPaired: boolean;
  // Selection phase
  mySquares?: number[];
  myReady?: boolean;
  partnerReady?: boolean;
  // Playing/finished phase
  marks?: Array<{ index: number; markedBy: string }>;
  myHits?: number;
  partnerHits?: number;
  myMarks?: number;
  partnerMarks?: number;
  // Finished phase only
  winner?: string;
  partnerSquares?: number[];
  card?: string[];
}
```

Remove `selectLine` method from `BingoPollingClient` (or rename to `selectSquares` with `{ squares }` body).

- [ ] **Step 7: Commit**

```bash
cd /c/Users/Ryan/CC/Projects/Jargon && git add src/lib/api.ts src/lib/websocket.ts src/lib/polling.ts src/lib/messageTypes.ts src/stores/duoStore.ts && git commit -m "frontend types: replace line selection w/ squares, scores w/ hits"
```

---

### Task 4: Frontend — Update duoStore & connectionStore Implementations

**Files:**
- Modify: `src/stores/duoStore.ts:115-527` (implementations)
- Modify: `src/stores/connectionStore.ts`

- [ ] **Step 1: Update `initialState`**

```ts
const initialState: DuoState = {
  pairCode: null,
  odId: null,
  odName: null,
  partnerId: null,
  partnerName: null,
  isPaired: false,
  isHost: false,
  phase: 'unpaired',
  mySquares: null,
  myReady: false,
  partnerReady: false,
  dailyCard: [],
  dailySeed: '',
  marks: [],
  myHits: 0,
  partnerHits: 0,
  gameOver: false,
  allHit: false,
  winner: null,
  partnerSquares: null,
  snapshot: null,
};
```

- [ ] **Step 2: Replace `selectLine` action with `selectSquares`**

```ts
selectSquares: async (squares: number[]) => {
  const state = get();
  if (!state.pairCode || !state.odId) {
    return { success: false, error: 'Not in a game' };
  }

  const response = await apiSelectSquares(state.pairCode, state.odId, squares);
  if (!response.success || !response.data) {
    return { success: false, error: response.error || 'Failed to select squares' };
  }
  if (!response.data.success) {
    return { success: false, error: response.data.error || 'Selection failed' };
  }

  set({ mySquares: squares, myReady: true });
  return { success: true };
},
```

Update the import at top of file:
```ts
import { selectSquares as apiSelectSquares, ... } from '../lib/api';
```

- [ ] **Step 3: Update `markSquare` action**

Replace score updates with hit updates:

```ts
markSquare: async (index: number) => {
  const state = get();
  if (state.phase !== 'playing') return;
  if (!state.pairCode || !state.odId) return;

  const existingMark = state.marks.find(m => m.index === index && m.markedBy === state.odId);
  if (existingMark) {
    set({ marks: state.marks.filter(m => !(m.index === index && m.markedBy === state.odId)) });
  } else {
    set({ marks: [...state.marks, { index, markedBy: state.odId! }] });
  }

  const response = await apiMarkSquare(state.pairCode, state.odId, index);
  if (response.success && response.data) {
    set({
      myHits: response.data.myHits,
      partnerHits: response.data.partnerHits,
    });
  }
},
```

- [ ] **Step 4: Update handler methods**

Replace `handlePartnerJoined` — remove turn logic:
```ts
handlePartnerJoined: (partner) => {
  set({
    partnerId: partner.id,
    partnerName: partner.name,
    isPaired: true,
    phase: 'selecting',
  });
},
```

Add `handlePartnerReady`:
```ts
handlePartnerReady: () => {
  set({ partnerReady: true });
},
```

Update `handlePartnerLeft`:
```ts
handlePartnerLeft: (roomDestroyed?: boolean) => {
  if (roomDestroyed) {
    useConnectionStore.getState().disconnect();
    set({
      ...initialState,
      dailyCard: get().dailyCard,
      dailySeed: get().dailySeed,
    });
  } else {
    set({
      partnerId: null,
      partnerName: null,
      isPaired: false,
      phase: 'waiting',
      mySquares: null,
      myReady: false,
      partnerReady: false,
      partnerSquares: null,
      marks: [],
      myHits: 0,
      partnerHits: 0,
      gameOver: false,
      winner: null,
    });
  }
},
```

Remove `handleYourTurnToPick`.

Update `handleSquareMarked`:
```ts
handleSquareMarked: (index: number, markedBy: string, isHit: boolean, myHits: number, partnerHits: number) => {
  const state = get();
  const alreadyMarked = state.marks.some(m => m.index === index && m.markedBy === markedBy);
  const newMarks = alreadyMarked ? state.marks : [...state.marks, { index, markedBy }];
  set({ marks: newMarks, myHits, partnerHits });
},
```

Update `handleSquareUnmarked`:
```ts
handleSquareUnmarked: (index: number, markedBy: string | undefined, myHits: number, partnerHits: number) => {
  const state = get();
  set({
    marks: markedBy
      ? state.marks.filter(m => !(m.index === index && m.markedBy === markedBy))
      : state.marks.filter(m => m.index !== index),
    myHits,
    partnerHits,
  });
},
```

Update `handleGameOver`:
```ts
handleGameOver: (winner: string, myHits: number, partnerHits: number, myMarks: number, partnerMarks: number, hostSquares: number[], partnerSquaresRevealed: number[], allHit?: boolean) => {
  const state = get();
  const isHost = state.isHost;
  const mySquares = isHost ? hostSquares : partnerSquaresRevealed;
  const theirSquares = isHost ? partnerSquaresRevealed : hostSquares;

  let winnerValue: 'me' | 'partner' | 'tie' | null = null;
  if (winner === 'tie') {
    winnerValue = 'tie';
  } else if (
    (winner === 'host' && isHost) ||
    (winner === 'partner' && !isHost)
  ) {
    winnerValue = 'me';
  } else {
    winnerValue = 'partner';
  }

  set({
    phase: 'finished',
    gameOver: true,
    allHit: allHit ?? false,
    winner: winnerValue,
    myHits,
    partnerHits,
    mySquares: mySquares,
    partnerSquares: theirSquares,
  });
},
```

Update `handleDailyReset`:
```ts
handleDailyReset: (newSeed: string) => {
  const state = get();
  set({
    mySquares: null,
    partnerSquares: null,
    myReady: false,
    partnerReady: false,
    dailyCard: [],
    dailySeed: newSeed,
    marks: [],
    myHits: 0,
    partnerHits: 0,
    gameOver: false,
    allHit: false,
    winner: null,
    snapshot: null,
    phase: state.isPaired ? 'selecting' : 'unpaired',
  });
},
```

Remove `getMyLineIndices` and `getPartnerLineIndices`.

- [ ] **Step 5: Update `partialize` in persist config**

```ts
partialize: (state) => ({
  pairCode: state.pairCode,
  odId: state.odId,
  odName: state.odName,
  partnerId: state.partnerId,
  partnerName: state.partnerName,
  isPaired: state.isPaired,
  isHost: state.isHost,
  phase: state.phase,
  mySquares: state.mySquares,
  myReady: state.myReady,
  partnerReady: state.partnerReady,
  dailySeed: state.dailySeed,
  marks: state.marks,
  myHits: state.myHits,
  partnerHits: state.partnerHits,
  gameOver: state.gameOver,
  winner: state.winner,
  partnerSquares: state.partnerSquares,
}),
```

- [ ] **Step 6: Update `connectionStore.ts` message handlers**

Update `handleWebSocketMessage`:
- Remove `YOUR_TURN_TO_PICK` case
- Add `PARTNER_READY` case: `duoStore.handlePartnerReady()`
- Update `SQUARE_MARKED` to pass `isHit` and use `hostHits`/`partnerHits`:

```ts
case DUO_MESSAGE_TYPES.PARTNER_READY:
  duoStore.handlePartnerReady();
  break;

case DUO_MESSAGE_TYPES.SQUARE_MARKED:
  if (typeof message.index === 'number' && message.markedBy) {
    const ds = useDuoStore.getState();
    const isHost = ds.isHost;
    const myHits = isHost ? (message.hostHits ?? ds.myHits) : (message.partnerHits ?? ds.myHits);
    const partnerHits = isHost ? (message.partnerHits ?? ds.partnerHits) : (message.hostHits ?? ds.partnerHits);
    duoStore.handleSquareMarked(message.index, message.markedBy, !!message.isHit, myHits, partnerHits);
  }
  break;

case DUO_MESSAGE_TYPES.SQUARE_UNMARKED:
  if (typeof message.index === 'number') {
    const ds = useDuoStore.getState();
    const isHost = ds.isHost;
    const myHits = isHost ? (message.hostHits ?? ds.myHits) : (message.partnerHits ?? ds.myHits);
    const partnerHits = isHost ? (message.partnerHits ?? ds.partnerHits) : (message.hostHits ?? ds.partnerHits);
    duoStore.handleSquareUnmarked(message.index, message.markedBy, myHits, partnerHits);
  }
  break;

case DUO_MESSAGE_TYPES.GAME_OVER:
  if (message.winner && message.hostSquares && message.partnerSquares) {
    const ds = useDuoStore.getState();
    const isHost = ds.isHost;
    const myHits = isHost ? (message.hostHits ?? 0) : (message.partnerHits ?? 0);
    const partnerHits = isHost ? (message.partnerHits ?? 0) : (message.hostHits ?? 0);
    const myMarks = isHost ? (message.hostMarks ?? 0) : (message.partnerMarks ?? 0);
    const partnerMarks = isHost ? (message.partnerMarks ?? 0) : (message.hostMarks ?? 0);
    duoStore.handleGameOver(message.winner, myHits, partnerHits, myMarks, partnerMarks, message.hostSquares, message.partnerSquares, message.allHit ?? false);
  }
  break;
```

Update `handlePollingUpdate` similarly — replace score fields with hit fields, remove line/turn fields, add squares/ready fields.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/Ryan/CC/Projects/Jargon && git add src/stores/duoStore.ts src/stores/connectionStore.ts && git commit -m "frontend stores: battleship squares selection + hit tracking"
```

---

### Task 5: Frontend — Replace LineSelector with SquareSelector

**Files:**
- Modify: `src/components/bingo/LineSelector.tsx` (rewrite as SquareSelector)

- [ ] **Step 1: Rewrite LineSelector.tsx as SquareSelector**

Replace entire file content. New component: tap squares to toggle (max 5), Ready button when exactly 5 selected:

```tsx
import { useState, useCallback } from 'react';

interface SquareSelectorProps {
  onSelect: (squares: number[]) => void;
  myReady: boolean;
  partnerReady: boolean;
  disabled?: boolean;
}

export function SquareSelector({
  onSelect,
  myReady,
  partnerReady,
  disabled = false,
}: SquareSelectorProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const interactable = !myReady && !disabled;

  const handleCellClick = useCallback((index: number) => {
    if (!interactable) return;

    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else if (next.size < 5) {
        next.add(index);
      }
      return next;
    });
  }, [interactable]);

  const handleConfirm = () => {
    if (selected.size === 5) {
      onSelect(Array.from(selected));
    }
  };

  const getStatusMessage = () => {
    if (myReady) {
      if (partnerReady) return null;
      return (
        <div className="text-center p-3 bg-j-accent/10 rounded-lg border border-j-accent/20">
          <p className="text-j-accent font-medium text-sm">
            Squares locked in!
          </p>
          <p className="text-j-tertiary text-xs font-mono mt-1">Waiting for partner...</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-j-text mb-2 tracking-tight">Hide Your Squares</h2>
        <p className="text-j-tertiary text-sm">
          {myReady
            ? 'Your squares are hidden. Waiting for partner...'
            : `Tap 5 squares to hide. ${selected.size}/5 selected.`
          }
        </p>
      </div>

      {/* Interactive grid */}
      <div className="max-w-sm mx-auto">
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: 25 }, (_, i) => {
            const isSelected = selected.has(i);

            return (
              <button
                key={i}
                onClick={() => handleCellClick(i)}
                disabled={!interactable}
                className={`
                  aspect-square rounded-lg border-2 transition-all duration-150 relative
                  ${isSelected
                    ? 'bg-j-accent/30 border-j-accent'
                    : 'bg-j-raised border-white/[0.06]'
                  }
                  ${interactable
                    ? selected.size < 5 || isSelected
                      ? 'cursor-pointer hover:border-j-accent/40 hover:bg-j-hover'
                      : 'cursor-not-allowed opacity-40'
                    : 'cursor-not-allowed opacity-40'
                  }
                `}
              >
                {isSelected && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-3 h-3 rounded-full bg-j-accent" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Ready button */}
      {selected.size === 5 && !myReady && (
        <div className="flex justify-center animate-fade-in">
          <button
            onClick={handleConfirm}
            className="px-6 py-2.5 bg-j-accent hover:bg-j-accent-hover text-j-bg font-semibold rounded-xl transition-colors"
          >
            Lock In Squares
          </button>
        </div>
      )}

      {getStatusMessage()}
    </div>
  );
}

export default SquareSelector;
```

- [ ] **Step 2: Commit**

```bash
cd /c/Users/Ryan/CC/Projects/Jargon && git add src/components/bingo/LineSelector.tsx && git commit -m "replace LineSelector w/ SquareSelector for battleship 5-square placement"
```

---

### Task 6: Frontend — Update BingoCard for Hit Display

**Files:**
- Modify: `src/components/bingo/BingoCard.tsx`

- [ ] **Step 1: Update BingoCard props and hit detection**

Replace line-based props with squares-based props. Add hit styling:

```tsx
import { useCallback, useRef } from 'react';
import type { BingoSquare } from '../../types';
import type { MarkEntry } from '../../stores/duoStore';

interface BingoCardProps {
  squares: BingoSquare[];
  onSquareClick: (index: number) => void;
  myPlayerId: string;
  marks: MarkEntry[];
  mySquares: number[];
  phase: 'playing' | 'finished';
  partnerSquares?: number[];
  isHost?: boolean;
}

export function BingoCard({
  squares,
  onSquareClick,
  myPlayerId,
  marks,
  mySquares,
  phase,
  partnerSquares = [],
  isHost,
}: BingoCardProps) {
  const iAmPartner = isHost === false;
  const gridRef = useRef<HTMLDivElement>(null);

  const getMarkInfo = (index: number) => {
    const myMark = marks.find(m => m.index === index && m.markedBy === myPlayerId);
    const partnerMark = marks.find(m => m.index === index && m.markedBy !== myPlayerId);
    return { myMark: !!myMark, partnerMark: !!partnerMark };
  };

  // Is this square one of MY hidden squares?
  const isMyHidden = (index: number) => mySquares.includes(index);

  // Is this square one of partner's hidden squares? (only known in finished phase)
  const isPartnerHidden = (index: number) => phase === 'finished' && partnerSquares.includes(index);

  // Did opponent mark one of my hidden squares? (hit on me)
  const isHitOnMe = (index: number) => {
    if (!mySquares.includes(index)) return false;
    return marks.some(m => m.index === index && m.markedBy !== myPlayerId);
  };

  // Did I mark one of opponent's hidden squares? (hit by me)
  // During playing: we know from server isHit flag, but for rendering we can check against mySquares
  // We only know partnerSquares in finished phase
  const isHitByMe = (index: number) => {
    if (phase === 'finished' && partnerSquares.includes(index)) {
      return marks.some(m => m.index === index && m.markedBy === myPlayerId);
    }
    return false;
  };

  const getSquareClasses = (index: number) => {
    let classes = 'bingo-square';
    const { myMark, partnerMark } = getMarkInfo(index);

    // Hidden square indicator (subtle, only visible to owner)
    if (isMyHidden(index) && phase === 'playing') {
      classes += ' ring-1 ring-j-accent/30';
    }

    // Finished phase: show placements
    if (phase === 'finished') {
      const mine = mySquares.includes(index);
      const theirs = partnerSquares.includes(index);
      if (mine && theirs) {
        classes += ' ring-2 ring-j-accent/60';
      } else if (mine) {
        classes += ' ring-1 ring-j-me/50';
      } else if (theirs) {
        classes += ' ring-1 ring-j-partner/50';
      }
    }

    // Mark colors
    if (myMark && partnerMark) {
      classes += ' marked';
    } else if (myMark) {
      classes += iAmPartner ? ' marked marked-partner' : ' marked marked-mine';
    } else if (partnerMark) {
      classes += iAmPartner ? ' marked marked-mine' : ' marked marked-partner';
    }

    // Hit styling — opponent marked my hidden square
    if (isHitOnMe(index)) {
      classes += ' hit-on-me';
    }

    // Hit styling in finished — I marked opponent's hidden square
    if (isHitByMe(index)) {
      classes += ' hit-by-me';
    }

    return classes;
  };

  // ... keep existing handleKeyDown and getAriaLabel (update aria to mention hits instead of lines)

  const totalMarked = marks.length;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-4 mb-4 text-xs font-mono">
        <div className="flex items-center gap-1.5">
          <div className={`w-2.5 h-2.5 rounded-sm ${iAmPartner ? 'bg-j-partner/70' : 'bg-j-me/70'}`}></div>
          <span className={iAmPartner ? 'text-j-partner' : 'text-j-me'}>Your marks</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-2.5 h-2.5 rounded-sm ${iAmPartner ? 'bg-j-me/70' : 'bg-j-partner/70'}`}></div>
          <span className={iAmPartner ? 'text-j-me' : 'text-j-partner'}>Partner marks</span>
        </div>
        {phase === 'playing' && (
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm ring-1 ring-j-accent/40 bg-transparent"></div>
            <span className="text-j-muted">Your hidden</span>
          </div>
        )}
        {phase === 'finished' && (
          <>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm ring-1 ring-j-me/50 bg-transparent"></div>
              <span className="text-j-me">Your squares</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm ring-1 ring-j-partner/50 bg-transparent"></div>
              <span className="text-j-partner">Partner squares</span>
            </div>
          </>
        )}
      </div>

      {/* 5x5 Grid — same structure as before, use getSquareClasses */}
      {/* ... keep existing grid JSX, just update className to use new getSquareClasses */}

      <div id="bingo-instructions" className="sr-only">
        Use arrow keys to navigate the grid. Press Enter or Space to mark a square when you hear the phrase.
      </div>

      <div className="mt-4 flex items-center justify-between px-1">
        <div className="text-xs text-j-secondary font-mono">Marked: {totalMarked}</div>
        <div className="text-xs text-j-muted font-mono">Tap matching phrases</div>
      </div>
    </div>
  );
}
```

Note: CSS classes `hit-on-me` and `hit-by-me` need to be added to `App.css`:

```css
.bingo-square.hit-on-me {
  box-shadow: inset 0 0 0 2px rgba(239, 68, 68, 0.6);
}

.bingo-square.hit-by-me {
  box-shadow: inset 0 0 0 2px rgba(34, 197, 94, 0.6);
}
```

- [ ] **Step 2: Commit**

```bash
cd /c/Users/Ryan/CC/Projects/Jargon && git add src/components/bingo/BingoCard.tsx src/App.css && git commit -m "BingoCard: battleship hit styling, hidden square indicators"
```

---

### Task 7: Frontend — Update DuoScoreboard, GameOverScreen, ShareCard

**Files:**
- Modify: `src/components/bingo/DuoScoreboard.tsx`
- Modify: `src/components/bingo/GameOverScreen.tsx`
- Modify: `src/components/bingo/ShareCard.tsx`

- [ ] **Step 1: Update DuoScoreboard**

Show hit counters instead of point scores:

```tsx
import { useDuoStore } from '../../stores/duoStore';

export function DuoScoreboard() {
  const { phase, odName, partnerName, myHits, partnerHits, dailySeed } = useDuoStore();

  if (phase !== 'playing' && phase !== 'finished') return null;

  const leader = myHits > partnerHits ? 'you' : partnerHits > myHits ? 'partner' : 'tie';

  return (
    <div className="apple-panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-j-text">Duo Match</h2>
        <span className="text-[10px] text-j-muted font-mono">{dailySeed}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded-lg p-3 ${leader === 'you' ? 'bg-j-me/15 ring-1 ring-j-me/40' : 'bg-j-raised'}`}>
          <span className="text-j-me font-medium text-xs truncate block mb-1">{odName || 'You'}</span>
          <div className="text-2xl font-bold text-j-me font-mono">{myHits}<span className="text-sm font-normal text-j-me/60">/5</span></div>
        </div>
        <div className={`rounded-lg p-3 ${leader === 'partner' ? 'bg-j-partner/15 ring-1 ring-j-partner/40' : 'bg-j-raised'}`}>
          <span className="text-j-partner font-medium text-xs truncate block mb-1">{partnerName || 'Partner'}</span>
          <div className="text-2xl font-bold text-j-partner font-mono">{partnerHits}<span className="text-sm font-normal text-j-partner/60">/5</span></div>
        </div>
      </div>

      <div className="text-[10px] text-j-muted text-center font-mono">
        <span>Find all 5 hidden squares to win</span>
        <span className="mx-1">·</span>
        <span>Tiebreaker: most marks</span>
      </div>
    </div>
  );
}

export default DuoScoreboard;
```

- [ ] **Step 2: Update GameOverScreen**

Replace score display with hits, update winner text:

```tsx
import { useState, useEffect } from 'react';
import { useDuoStore } from '../../stores/duoStore';
import { ShareCard } from './ShareCard';

export function GameOverScreen() {
  const { odName, partnerName, myHits, partnerHits, winner, allHit, dailySeed } = useDuoStore();

  const [showShare, setShowShare] = useState(false);
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      const diff = tomorrow.getTime() - now.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setCountdown(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  const getWinnerText = () => {
    if (winner === 'tie') return "It's a draw!";
    if (winner === 'me') return allHit ? 'All 5 sunk! You win!' : 'You win!';
    return allHit ? `All 5 sunk! ${partnerName || 'Partner'} wins!` : `${partnerName || 'Partner'} wins!`;
  };

  const getWinnerEmoji = () => {
    if (winner === 'tie') return '🤝';
    if (winner === 'me') return '🏆';
    return '😤';
  };

  return (
    <>
      <div className="max-w-2xl mx-auto text-center py-8 space-y-6 animate-fade-in-up">
        <div className="space-y-3">
          <div className="text-5xl">{getWinnerEmoji()}</div>
          <h2 className="text-3xl font-bold text-j-text tracking-tight">{getWinnerText()}</h2>
          <p className="text-j-muted text-xs font-mono tracking-wider">{dailySeed}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className={`rounded-xl p-5 transition-all ${winner === 'me' || winner === 'tie' ? 'bg-j-me/15 ring-1 ring-j-me/40' : 'bg-j-raised'}`}>
            <p className="text-j-me font-medium text-xs mb-1 truncate">{odName || 'You'}</p>
            <p className="text-4xl font-bold text-j-me font-mono">{myHits}<span className="text-lg font-normal text-j-me/60">/5</span></p>
            <p className="text-j-me/50 text-xs font-mono mt-1">hits</p>
          </div>
          <div className={`rounded-xl p-5 transition-all ${winner === 'partner' || winner === 'tie' ? 'bg-j-partner/15 ring-1 ring-j-partner/40' : 'bg-j-raised'}`}>
            <p className="text-j-partner font-medium text-xs mb-1 truncate">{partnerName || 'Partner'}</p>
            <p className="text-4xl font-bold text-j-partner font-mono">{partnerHits}<span className="text-lg font-normal text-j-partner/60">/5</span></p>
            <p className="text-j-partner/50 text-xs font-mono mt-1">hits</p>
          </div>
        </div>

        <button onClick={() => setShowShare(true)}
          className="w-full px-6 py-4 bg-j-accent hover:bg-j-accent-hover text-j-bg font-bold text-base rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-j-accent/20">
          Share Result
        </button>

        <div className="apple-panel p-4">
          <p className="text-j-muted text-xs font-mono uppercase tracking-wider">Next card in</p>
          <p className="text-2xl font-mono font-bold text-j-accent mt-1">{countdown}</p>
          <p className="text-j-muted text-[10px] font-mono mt-1">Resets at UTC midnight</p>
        </div>
      </div>

      {showShare && <ShareCard onClose={() => setShowShare(false)} />}
    </>
  );
}

export default GameOverScreen;
```

- [ ] **Step 3: Update ShareCard**

Replace line-based emoji grid with squares-based:

```tsx
import { useState } from 'react';
import { useDuoStore } from '../../stores/duoStore';

interface ShareCardProps {
  onClose: () => void;
}

export function ShareCard({ onClose }: ShareCardProps) {
  const { mySquares, partnerSquares, myHits, partnerHits, winner, dailySeed, odName, partnerName, marks } = useDuoStore();
  const [copied, setCopied] = useState(false);

  const mySquareSet = new Set(mySquares || []);
  const partnerSquareSet = new Set(partnerSquares || []);
  const myPlayerId = useDuoStore.getState().odId;
  
  const buildGrid = (): string => {
    const rows: string[] = [];
    for (let row = 0; row < 5; row++) {
      let line = '';
      for (let col = 0; col < 5; col++) {
        const idx = row * 5 + col;
        const isMine = mySquareSet.has(idx);
        const isTheirs = partnerSquareSet.has(idx);
        const wasHit = isTheirs && marks.some(m => m.index === idx && m.markedBy === myPlayerId);
        
        if (isMine && isTheirs) line += '🟪';
        else if (wasHit) line += '💥';
        else if (isMine) line += '🟦';
        else if (isTheirs) line += '🟧';
        else line += '⬜';
      }
      rows.push(line);
    }
    return rows.join('\n');
  };

  const getWinnerText = () => {
    if (winner === 'tie') return 'Draw!';
    if (winner === 'me') return `${odName || 'Me'} wins`;
    return `${partnerName || 'Partner'} wins`;
  };

  const shareText = [
    `Jargon Duo - ${dailySeed}`,
    '',
    `${odName || 'Me'}: ${myHits}/5 hits | ${partnerName || 'Partner'}: ${partnerHits}/5 hits`,
    getWinnerText(),
    '',
    buildGrid(),
    '',
    '🟦 mine  🟧 theirs  💥 hit  🟪 overlap',
    'playjargon.com',
  ].join('\n');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = shareText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm z-[1000]" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[1001] w-full max-w-sm px-4">
        <div className="bg-j-surface border border-white/[0.06] rounded-2xl shadow-2xl p-6 space-y-4">
          <h3 className="text-lg font-semibold text-j-text text-center">Share Result</h3>
          <div className="bg-j-raised rounded-xl p-4 font-mono text-sm text-j-secondary whitespace-pre-wrap leading-relaxed">
            {shareText}
          </div>
          <button onClick={handleCopy}
            className={`w-full px-4 py-3 rounded-xl font-semibold transition-all ${copied ? 'bg-j-success text-white' : 'bg-j-accent hover:bg-j-accent-hover text-j-bg'}`}>
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>
          <button onClick={onClose} className="w-full px-4 py-2 text-j-secondary hover:text-j-text transition-colors text-sm">
            Close
          </button>
        </div>
      </div>
    </>
  );
}

export default ShareCard;
```

- [ ] **Step 4: Commit**

```bash
cd /c/Users/Ryan/CC/Projects/Jargon && git add src/components/bingo/DuoScoreboard.tsx src/components/bingo/GameOverScreen.tsx src/components/bingo/ShareCard.tsx && git commit -m "scoreboard/gameover/share: hits-based display for battleship mode"
```

---

### Task 8: Frontend — Update App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Update imports and state usage**

Replace `LineSelector` import with `SquareSelector`. Remove line-related store fields. Add squares/hits fields:

```tsx
import { SquareSelector } from './components/bingo/LineSelector'; // same file, renamed export

// In the store destructure, replace:
// myLine, isMyTurnToPick, partnerHasSelected, selectLine, getMyLineIndices, getPartnerLineIndices
// with:
// mySquares, myReady, partnerReady, selectSquares, partnerSquares, myHits, partnerHits
```

- [ ] **Step 2: Update `handleLineSelect` to `handleSquaresSelect`**

```tsx
const handleSquaresSelect = async (squares: number[]) => {
  const result = await selectSquares(squares);
  if (result.success) {
    showGameToast('Squares Hidden', 'Waiting for partner...', 'success');
  } else if (result.error) {
    showGameToast('Error', result.error, 'error');
  }
};
```

- [ ] **Step 3: Update selecting phase JSX**

```tsx
{phase === 'selecting' && (
  <div className="py-8">
    <SquareSelector
      onSelect={handleSquaresSelect}
      myReady={myReady}
      partnerReady={partnerReady}
      disabled={myReady}
    />
    {isPaired && (
      <div className="mt-6 text-center text-j-tertiary text-sm">
        Playing with: <span className="text-j-text">{partnerName}</span>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 4: Update playing phase BingoCard props**

```tsx
{phase === 'playing' && dailyCard.length > 0 && (
  <>
    <div className="text-center mb-4">
      <p className="text-sm text-j-tertiary">Today's Card</p>
    </div>
    <div className="mb-6">
      <DuoScoreboard />
    </div>
    <BingoCard
      squares={boardSquares}
      onSquareClick={handleSquareClick}
      myPlayerId={odId || ''}
      marks={marks}
      mySquares={mySquares || []}
      isHost={isHost}
      phase="playing"
    />
  </>
)}
```

- [ ] **Step 5: Update finished phase BingoCard props**

```tsx
{phase === 'finished' && (
  <>
    <GameOverScreen />
    {dailyCard.length > 0 && (
      <div className="mt-8">
        <BingoCard
          squares={boardSquares}
          onSquareClick={() => {}}
          myPlayerId={odId || ''}
          marks={marks}
          mySquares={mySquares || []}
          isHost={isHost}
          phase="finished"
          partnerSquares={partnerSquares || []}
        />
      </div>
    )}
  </>
)}
```

- [ ] **Step 6: Update sidebar scoring rules**

```tsx
<div className="apple-panel p-4">
  <h3 className="text-sm font-medium text-j-secondary mb-3">Scoring</h3>
  <ul className="text-xs text-j-tertiary space-y-1">
    <li>Mark squares when you hear them</li>
    <li>Hit = marking opponent's hidden square</li>
    <li>5/5 hits = instant win</li>
    <li>Midnight: most hits wins, tiebreaker: most marks</li>
  </ul>
</div>
```

Also update sidebar player info to show hits instead of pts:
```tsx
<span className="text-j-me font-bold">{myHits}/5 hits</span>
...
<span className="text-j-partner font-bold">{partnerHits}/5 hits</span>
```

- [ ] **Step 7: Commit**

```bash
cd /c/Users/Ryan/CC/Projects/Jargon && git add src/App.tsx && git commit -m "App.tsx: wire up battleship square selection + hit display"
```

---

### Task 9: Clean Up Dead Code

**Files:**
- Modify: `src/lib/dailyCard.ts` — remove line-only helpers that are no longer used by duo mode (keep `getLineIndices` if solo mode uses it, otherwise remove)
- Modify: `src/stores/duoStore.ts` — remove any leftover `LineSelection` imports/references
- Verify: `src/lib/bingoEngine.ts` — already unused, leave as-is

- [ ] **Step 1: Check what still uses line functions**

Check if `getLineIndices`, `isSquareInLine`, `ALL_LINES`, `countCompletedLines`, `getCompletedLineIndices`, `countMarkedInLine`, `isLineComplete` are used anywhere besides old tests.

If only used in `dailyCard.test.ts` and `bingoEngine.test.ts` — these tests need updating too (Task 10).

Solo mode (`soloStore.ts`) may use some of these — check before removing.

- [ ] **Step 2: Remove unused imports from duoStore**

Remove `getLineIndices` import from duoStore.ts (was used by `getMyLineIndices`/`getPartnerLineIndices` which are now gone).

Remove old `selectLine as apiSelectLine` import.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/Ryan/CC/Projects/Jargon && git add -A && git commit -m "remove dead bingo line code from duo path"
```

---

### Task 10: Update Tests

**Files:**
- Modify: `tests/unit/duoStore.test.ts`
- Modify: `tests/api/duo-scoring.test.ts`
- Modify: `src/lib/dailyCard.test.ts` (if line tests are now irrelevant)

- [ ] **Step 1: Rewrite `duoStore.test.ts` for battleship**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useDuoStore } from '../../src/stores/duoStore';

describe('duoStore battleship handlers', () => {
  beforeEach(() => {
    useDuoStore.setState({
      phase: 'playing',
      isHost: true,
      odId: 'host-1',
      odName: 'Host',
      partnerId: 'partner-1',
      partnerName: 'Partner',
      isPaired: true,
      pairCode: 'ABCD',
      mySquares: [0, 1, 2, 3, 4],
      myReady: true,
      partnerReady: true,
      partnerSquares: null,
      dailyCard: [],
      dailySeed: '2026-04-07',
      marks: [],
      myHits: 0,
      partnerHits: 0,
      gameOver: false,
      allHit: false,
      winner: null,
      snapshot: null,
    });
  });

  describe('handleGameOver', () => {
    it('sets allHit true when all squares found', () => {
      const store = useDuoStore.getState();
      store.handleGameOver('host', 5, 2, 12, 8, [0, 1, 2, 3, 4], [10, 11, 12, 13, 14], true);

      const state = useDuoStore.getState();
      expect(state.allHit).toBe(true);
      expect(state.winner).toBe('me');
      expect(state.phase).toBe('finished');
      expect(state.gameOver).toBe(true);
      expect(state.myHits).toBe(5);
      expect(state.partnerHits).toBe(2);
    });

    it('sets allHit false for midnight win', () => {
      const store = useDuoStore.getState();
      store.handleGameOver('host', 3, 2, 10, 8, [0, 1, 2, 3, 4], [10, 11, 12, 13, 14], false);

      const state = useDuoStore.getState();
      expect(state.allHit).toBe(false);
      expect(state.winner).toBe('me');
    });

    it('maps partner winner correctly when I am host', () => {
      const store = useDuoStore.getState();
      store.handleGameOver('partner', 2, 5, 8, 12, [0, 1, 2, 3, 4], [10, 11, 12, 13, 14], true);

      const state = useDuoStore.getState();
      expect(state.winner).toBe('partner');
    });

    it('maps host winner correctly when I am partner', () => {
      useDuoStore.setState({ isHost: false });
      const store = useDuoStore.getState();
      store.handleGameOver('host', 5, 2, 12, 8, [0, 1, 2, 3, 4], [10, 11, 12, 13, 14], false);

      const state = useDuoStore.getState();
      expect(state.winner).toBe('partner');
    });

    it('handles tie', () => {
      const store = useDuoStore.getState();
      store.handleGameOver('tie', 3, 3, 10, 10, [0, 1, 2, 3, 4], [10, 11, 12, 13, 14], false);

      const state = useDuoStore.getState();
      expect(state.winner).toBe('tie');
    });

    it('reveals both placements on game over', () => {
      const store = useDuoStore.getState();
      store.handleGameOver('host', 5, 2, 12, 8, [0, 1, 2, 3, 4], [10, 11, 12, 13, 14], true);

      const state = useDuoStore.getState();
      expect(state.mySquares).toEqual([0, 1, 2, 3, 4]);
      expect(state.partnerSquares).toEqual([10, 11, 12, 13, 14]);
    });
  });

  describe('handleDailyReset', () => {
    it('resets all battleship state', () => {
      useDuoStore.setState({ allHit: true, gameOver: true, myHits: 5 });

      const store = useDuoStore.getState();
      store.handleDailyReset('2026-04-08');

      const state = useDuoStore.getState();
      expect(state.allHit).toBe(false);
      expect(state.gameOver).toBe(false);
      expect(state.myHits).toBe(0);
      expect(state.partnerHits).toBe(0);
      expect(state.winner).toBe(null);
      expect(state.marks).toEqual([]);
      expect(state.mySquares).toBe(null);
      expect(state.partnerSquares).toBe(null);
      expect(state.myReady).toBe(false);
      expect(state.partnerReady).toBe(false);
    });

    it('resets to selecting phase when paired', () => {
      useDuoStore.setState({ isPaired: true, allHit: true });
      useDuoStore.getState().handleDailyReset('2026-04-08');
      expect(useDuoStore.getState().phase).toBe('selecting');
    });

    it('resets to unpaired phase when not paired', () => {
      useDuoStore.setState({ isPaired: false });
      useDuoStore.getState().handleDailyReset('2026-04-08');
      expect(useDuoStore.getState().phase).toBe('unpaired');
    });
  });

  describe('handlePartnerReady', () => {
    it('sets partnerReady to true', () => {
      useDuoStore.setState({ phase: 'selecting', partnerReady: false });
      useDuoStore.getState().handlePartnerReady();
      expect(useDuoStore.getState().partnerReady).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Rewrite `duo-scoring.test.ts` for battleship**

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';

const API_BASE = 'https://jargon-api.playjargon.workers.dev/api/duo';

async function api(method: string, path: string, body?: any, playerId?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (playerId) headers['X-Player-ID'] = playerId;
  const res = await fetch(`${API_BASE}${path}`, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function setupPlayingRoom() {
  const createRes = await api('POST', '/create', { playerName: 'TestHost' });
  const code = createRes.code;
  const hostId = createRes.playerId;

  const joinRes = await api('POST', '/join', { code, playerName: 'TestPartner' });
  const partnerId = joinRes.playerId;

  // Host hides squares 0-4, partner hides squares 20-24
  await api('POST', `/${code}/select`, { squares: [0, 1, 2, 3, 4] }, hostId);
  await api('POST', `/${code}/select`, { squares: [20, 21, 22, 23, 24] }, partnerId);

  return { code, hostId, partnerId };
}

describe('Duo Battleship API', () => {
  describe('hit detection', () => {
    it('marking non-hidden square = 0 hits', async () => {
      const { code, hostId } = await setupPlayingRoom();
      const res = await api('POST', `/${code}/mark`, { index: 12 }, hostId);
      expect(res.success).toBe(true);
      expect(res.myHits).toBe(0);
      expect(res.gameOver).toBe(false);
    }, 15000);

    it('marking opponent hidden square = 1 hit', async () => {
      const { code, hostId } = await setupPlayingRoom();
      // Partner hid on 20-24, host marks 20
      const res = await api('POST', `/${code}/mark`, { index: 20 }, hostId);
      expect(res.success).toBe(true);
      expect(res.myHits).toBe(1);
      expect(res.isHit).toBe(true);
    }, 15000);

    it('marking own hidden square does not count as hit against you', async () => {
      const { code, hostId, partnerId } = await setupPlayingRoom();
      // Host hid on 0-4, host marks 0 (own square)
      await api('POST', `/${code}/mark`, { index: 0 }, hostId);
      const state = await api('GET', `/${code}/state`, undefined, partnerId);
      // Partner's hits should be 0 (host marking own square doesn't count)
      expect(state.myHits).toBe(0);
    }, 15000);
  });

  describe('instant win', () => {
    it('hitting all 5 opponent squares = instant win', async () => {
      const { code, hostId } = await setupPlayingRoom();
      for (const idx of [20, 21, 22, 23, 24]) {
        const res = await api('POST', `/${code}/mark`, { index: idx }, hostId);
        if (idx === 24) {
          expect(res.gameOver).toBe(true);
          expect(res.allHit).toBe(true);
        } else {
          expect(res.gameOver).toBe(false);
        }
      }
      const state = await api('GET', `/${code}/state`, undefined, hostId);
      expect(state.phase).toBe('finished');
      expect(state.winner).toBe('host');
    }, 15000);

    it('marking non-hidden squares does not trigger win', async () => {
      const { code, hostId } = await setupPlayingRoom();
      for (const idx of [10, 11, 12, 13, 14]) {
        const res = await api('POST', `/${code}/mark`, { index: idx }, hostId);
        expect(res.gameOver).toBe(false);
      }
    }, 15000);
  });

  describe('selection validation', () => {
    it('rejects fewer than 5 squares', async () => {
      const createRes = await api('POST', '/create', { playerName: 'Host' });
      const joinRes = await api('POST', '/join', { code: createRes.code, playerName: 'Partner' });
      const res = await api('POST', `/${createRes.code}/select`, { squares: [0, 1, 2] }, createRes.playerId);
      expect(res.error).toContain('exactly 5');
    }, 15000);

    it('rejects duplicate squares', async () => {
      const createRes = await api('POST', '/create', { playerName: 'Host' });
      await api('POST', '/join', { code: createRes.code, playerName: 'Partner' });
      const res = await api('POST', `/${createRes.code}/select`, { squares: [0, 0, 1, 2, 3] }, createRes.playerId);
      expect(res.error).toContain('Invalid');
    }, 15000);

    it('rejects out of range squares', async () => {
      const createRes = await api('POST', '/create', { playerName: 'Host' });
      await api('POST', '/join', { code: createRes.code, playerName: 'Partner' });
      const res = await api('POST', `/${createRes.code}/select`, { squares: [0, 1, 2, 3, 25] }, createRes.playerId);
      expect(res.error).toContain('Invalid');
    }, 15000);
  });

  describe('score verification', () => {
    it('both players hits are independent', async () => {
      const { code, hostId, partnerId } = await setupPlayingRoom();
      // Host hits partner's squares
      await api('POST', `/${code}/mark`, { index: 20 }, hostId);
      await api('POST', `/${code}/mark`, { index: 21 }, hostId);
      // Partner hits host's squares
      await api('POST', `/${code}/mark`, { index: 0 }, partnerId);

      const hostState = await api('GET', `/${code}/state`, undefined, hostId);
      const partnerState = await api('GET', `/${code}/state`, undefined, partnerId);

      expect(hostState.myHits).toBe(2);
      expect(hostState.partnerHits).toBe(1);
      expect(partnerState.myHits).toBe(1);
      expect(partnerState.partnerHits).toBe(2);
    }, 15000);
  });

  describe('toggle', () => {
    it('unmark removes hit', async () => {
      const { code, hostId } = await setupPlayingRoom();
      await api('POST', `/${code}/mark`, { index: 20 }, hostId);
      let state = await api('GET', `/${code}/state`, undefined, hostId);
      expect(state.myHits).toBe(1);

      // Toggle off
      await api('POST', `/${code}/mark`, { index: 20 }, hostId);
      state = await api('GET', `/${code}/state`, undefined, hostId);
      expect(state.myHits).toBe(0);
    }, 15000);
  });
});
```

- [ ] **Step 3: Run unit tests**

```bash
cd /c/Users/Ryan/CC/Projects/Jargon && npm test
```

Expected: All unit tests pass.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/Ryan/CC/Projects/Jargon && git add tests/ src/lib/dailyCard.test.ts && git commit -m "tests: rewrite for battleship mode — hits, square selection, instant win"
```

---

### Task 11: Update Docs & Deploy

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: Update CLAUDE.md**

Replace all bingo/line references with battleship/squares references. Update scoring section, game flow, backend functions, WS messages.

- [ ] **Step 2: Update README.md**

Update Duo description to battleship mechanics.

- [ ] **Step 3: Build and verify**

```bash
cd /c/Users/Ryan/CC/Projects/Jargon && npm run build
```

Expected: Clean build, no TypeScript errors.

- [ ] **Step 4: Deploy backend**

```bash
cd /c/Users/Ryan/CC/Projects/Jargon && npx wrangler deploy
```

Note: Existing Durable Objects will have old schema. New rooms will use new schema. Old rooms may error — acceptable since this is a breaking change and daily reset clears state anyway.

- [ ] **Step 5: Commit docs + push**

```bash
cd /c/Users/Ryan/CC/Projects/Jargon && git add CLAUDE.md README.md && git commit -m "docs: update for battleship mode"
git push
```

- [ ] **Step 6: Run API integration tests against deployed worker**

```bash
cd /c/Users/Ryan/CC/Projects/Jargon && npx vitest run --config vitest.config.api.ts
```

Expected: All API tests pass.

---

## Unresolved Questions

- **Hit animation**: What visual effect for hits? (Spec says "something cool" — decide during implementation)
- **Durable Object migration**: Old rooms have `host_line`/`partner_line` columns. New schema uses `host_squares`/`partner_squares`. Since `CREATE TABLE IF NOT EXISTS` won't alter existing tables, rooms created before deploy will break. Options: (a) accept breakage (daily reset clears rooms), (b) add migration logic. Recommend (a) since rooms are ephemeral.
