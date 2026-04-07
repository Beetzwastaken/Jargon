// Jargon - Duo Mode Backend
// Cloudflare Workers with Durable Objects for paired play

import { JARGON_PHRASES } from './src/data/buzzwords.ts';
const BUZZWORDS = JARGON_PHRASES;

// Import and re-export DashboardAnalytics for wrangler
export { DashboardAnalytics } from './analytics-worker.js';

// CORS helper
function corsHeaders(origin) {
  const allowedOrigins = [
    'https://playjargon.com',
    'http://localhost:8080',
    'http://localhost:3000',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'http://localhost:5177',
    'http://localhost:5178',
    'http://localhost:5179',
    'http://localhost:5180'
  ];

  const validOrigin = allowedOrigins.includes(origin) ? origin : null;

  return {
    'Access-Control-Allow-Origin': validOrigin || 'null',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Player-ID',
    'Access-Control-Max-Age': '86400',
  };
}

// Seeded PRNG - Mulberry32 (must match frontend)
function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Convert YYYY-MM-DD to numeric seed
function dateToSeed(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return (year * 10000) + (month * 100) + day;
}

// Fisher-Yates shuffle with seeded RNG
function seededShuffle(array, rng) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Generate daily card from date string
function generateDailyCard(dateString) {
  const seed = dateToSeed(dateString);
  const rng = mulberry32(seed);
  const shuffled = seededShuffle([...BUZZWORDS], rng);
  return shuffled.slice(0, 25);
}

// Get today's date in UTC
function getTodayUTC() {
  return new Date().toISOString().split('T')[0];
}

// Main Worker
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    // Handle preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: corsHeaders(origin)
      });
    }

    try {
      // Analytics delegation (unchanged)
      if (url.pathname === '/api/performance' ||
          url.pathname === '/api/buzzwords' ||
          url.pathname === '/api/analytics/players' ||
          url.pathname.startsWith('/api/ingest') ||
          url.pathname.startsWith('/ws/dashboard')) {
        try {
          if (!env.ANALYTICS) {
            return new Response(JSON.stringify({
              error: 'Analytics service temporarily unavailable'
            }), {
              status: 503,
              headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
            });
          }
          const analyticsId = env.ANALYTICS.idFromName('dashboard-analytics');
          const analyticsObj = env.ANALYTICS.get(analyticsId);
          return analyticsObj.fetch(request, env);
        } catch (error) {
          return new Response(JSON.stringify({ error: 'Analytics unavailable' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
          });
        }
      }

      // Duo: Create Game - POST /api/duo/create
      if (url.pathname === '/api/duo/create' && request.method === 'POST') {
        const body = await request.json();
        const { playerName, timezone } = body;

        if (!playerName || typeof playerName !== 'string' || playerName.trim().length === 0) {
          return new Response(JSON.stringify({ error: 'Invalid player name' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
          });
        }

        const roomCode = await generateRoomCode(env);
        const roomId = env.ROOMS.idFromName(roomCode);
        const roomObj = env.ROOMS.get(roomId);

        const response = await roomObj.fetch(new Request('https://dummy/duo/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerName: playerName.trim().slice(0, 20),
            roomCode,
            timezone: timezone || 'UTC'
          })
        }));

        const result = await response.json();
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
        });
      }

      // Duo: Join Game - POST /api/duo/join
      if (url.pathname === '/api/duo/join' && request.method === 'POST') {
        const body = await request.json();
        const { code, playerName } = body;

        if (!code || !playerName) {
          return new Response(JSON.stringify({ error: 'Invalid code or player name' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
          });
        }

        const roomCode = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
        const roomId = env.ROOMS.idFromName(roomCode);
        const roomObj = env.ROOMS.get(roomId);

        const response = await roomObj.fetch(new Request('https://dummy/duo/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerName: playerName.trim().slice(0, 20) })
        }));

        if (response.status === 404) {
          return new Response(JSON.stringify({ error: 'Room not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
          });
        }

        if (response.status === 400) {
          const err = await response.json();
          return new Response(JSON.stringify(err), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
          });
        }

        const result = await response.json();
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
        });
      }

      // Duo: Select Line - POST /api/duo/:code/select
      if (url.pathname.match(/^\/api\/duo\/([A-Z0-9]{4})\/select$/) && request.method === 'POST') {
        const roomCode = url.pathname.split('/')[3];
        const playerId = request.headers.get('X-Player-ID');
        const body = await request.json();

        const roomId = env.ROOMS.idFromName(roomCode);
        const roomObj = env.ROOMS.get(roomId);

        const response = await roomObj.fetch(new Request('https://dummy/duo/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Player-ID': playerId || '' },
          body: JSON.stringify(body)
        }));

        const result = await response.json();
        return new Response(JSON.stringify(result), {
          status: response.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
        });
      }

      // Duo: Mark Square - POST /api/duo/:code/mark
      if (url.pathname.match(/^\/api\/duo\/([A-Z0-9]{4})\/mark$/) && request.method === 'POST') {
        const roomCode = url.pathname.split('/')[3];
        const playerId = request.headers.get('X-Player-ID');
        const body = await request.json();

        const roomId = env.ROOMS.idFromName(roomCode);
        const roomObj = env.ROOMS.get(roomId);

        const response = await roomObj.fetch(new Request('https://dummy/duo/mark', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Player-ID': playerId || '' },
          body: JSON.stringify(body)
        }));

        const result = await response.json();
        return new Response(JSON.stringify(result), {
          status: response.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
        });
      }

      // Duo: Leave Game - POST /api/duo/:code/leave
      if (url.pathname.match(/^\/api\/duo\/([A-Z0-9]{4})\/leave$/) && request.method === 'POST') {
        const roomCode = url.pathname.split('/')[3];
        const playerId = request.headers.get('X-Player-ID');

        const roomId = env.ROOMS.idFromName(roomCode);
        const roomObj = env.ROOMS.get(roomId);

        const response = await roomObj.fetch(new Request('https://dummy/duo/leave', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Player-ID': playerId || '' }
        }));

        const result = await response.json();
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
        });
      }

      // Duo: Get State - GET /api/duo/:code/state
      if (url.pathname.match(/^\/api\/duo\/([A-Z0-9]{4})\/state$/) && request.method === 'GET') {
        const roomCode = url.pathname.split('/')[3];
        const playerId = request.headers.get('X-Player-ID');

        const roomId = env.ROOMS.idFromName(roomCode);
        const roomObj = env.ROOMS.get(roomId);

        const response = await roomObj.fetch(new Request('https://dummy/duo/state', {
          method: 'GET',
          headers: { 'X-Player-ID': playerId || '' }
        }));

        if (response.status === 404) {
          return new Response(JSON.stringify({ error: 'Room not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
          });
        }

        const result = await response.json();
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
        });
      }

      // Duo: Snapshot - GET /api/duo/:code/snapshot
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
          status: response.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
        });
      }

      // WebSocket connection - GET /api/duo/:code/ws
      if (url.pathname.match(/^\/api\/duo\/([A-Z0-9]{4})\/ws$/) && request.headers.get('Upgrade') === 'websocket') {
        const roomCode = url.pathname.split('/')[3];
        const roomId = env.ROOMS.idFromName(roomCode);
        const roomObj = env.ROOMS.get(roomId);
        return roomObj.fetch(request);
      }

      // Health check
      if (url.pathname === '/api/health' || url.pathname === '/health') {
        return new Response(JSON.stringify({
          status: 'healthy',
          timestamp: Date.now(),
          version: '2.0.0-duo',
          endpoint: url.pathname
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
        });
      }

      // Legacy room endpoints return deprecation notice
      if (url.pathname.startsWith('/api/room/')) {
        return new Response(JSON.stringify({
          error: 'Legacy room endpoints deprecated. Use /api/duo/* for duo mode.'
        }), {
          status: 410,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
        });
      }

      return new Response('Not Found', { status: 404 });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
      });
    }
  }
};

// Generate 4-char room code
async function generateRoomCode(env) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }

    try {
      const roomId = env.ROOMS.idFromName(code);
      const roomObj = env.ROOMS.get(roomId);
      const checkResponse = await roomObj.fetch(new Request('https://dummy/exists'));
      if (checkResponse.status === 404) {
        return code;
      }
    } catch (error) {
      return code;
    }
  }
  throw new Error('Could not generate unique room code');
}

// BingoRoom Durable Object - Duo Mode (SQLite-backed)
export class BingoRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map(); // playerId -> WebSocket
    this.sql = state.storage.sql;
    this.initializeSchema();
  }

  // --- Schema & Helpers (Task 2) ---

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

  updateRoom(fields) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return;
    const sets = [];
    const vals = [];
    for (const key of keys) {
      sets.push(`${key} = ?`);
      const val = fields[key];
      // Serialize squares arrays as JSON
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

  getMarks() {
    return this.sql.exec('SELECT idx, marked_by, marked_at FROM marks ORDER BY idx').toArray();
  }

  // Count opponent's hidden squares that have been marked by someone other than the opponent
  computeHits(playerId, room) {
    const isHost = playerId === room.host_id;
    const opponentSquares = isHost ? room.partner_squares : room.host_squares;
    if (!opponentSquares) return 0;
    const opponentId = isHost ? room.partner_id : room.host_id;
    const marks = this.getMarks();
    const opponentSquareSet = new Set(opponentSquares);
    // Only marks by someone OTHER than the opponent count as hits
    return marks.filter(m => opponentSquareSet.has(m.idx) && m.marked_by !== opponentId).length;
  }

  // Count total marks placed by a player
  countMarks(playerId) {
    const marks = this.getMarks();
    return marks.filter(m => m.marked_by === playerId).length;
  }

  // Check if all 5 of opponent's hidden squares are hit
  checkAllHit(playerId, room) {
    return this.computeHits(playerId, room) >= 5;
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

  // --- Routing ---

  async fetch(request) {
    const url = new URL(request.url);

    try {
      if (url.pathname === '/duo/create') return await this.createDuoGame(request);
      if (url.pathname === '/duo/join') return await this.joinDuoGame(request);
      if (url.pathname === '/duo/select') return await this.selectSquares(request);
      if (url.pathname === '/duo/mark') return await this.markSquare(request);
      if (url.pathname === '/duo/leave') return await this.leaveGame(request);
      if (url.pathname === '/duo/state') return await this.getState(request);
      if (url.pathname === '/duo/snapshot') return await this.getSnapshot(request);
      if (url.pathname === '/exists') {
        const room = this.getRoom();
        return room ? new Response('exists') : new Response('not found', { status: 404 });
      }
      if (request.headers.get('Upgrade') === 'websocket') {
        return await this.handleWebSocket(request);
      }

      return new Response('Not found', { status: 404 });
    } catch (error) {
      console.error('BingoRoom error:', error);
      return new Response(JSON.stringify({ error: 'Room processing error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // --- Task 3: Create, Join, Leave ---

  async createDuoGame(request) {
    const { playerName, roomCode } = await request.json();

    const hostId = crypto.randomUUID();
    const dailySeed = getTodayUTC();
    const now = Date.now();

    this.sql.exec(
      `INSERT OR REPLACE INTO room (id, code, host_id, host_name, partner_id, partner_name, phase, host_squares, partner_squares, host_ready, partner_ready, daily_seed, created_at, last_activity)
       VALUES (1, ?, ?, ?, NULL, NULL, 'waiting', NULL, NULL, 0, 0, ?, ?, ?)`,
      roomCode, hostId, playerName, dailySeed, now, now
    );

    return new Response(JSON.stringify({
      success: true,
      code: roomCode,
      playerId: hostId,
      playerName,
      dailySeed
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async joinDuoGame(request) {
    const { playerName } = await request.json();
    const room = this.getRoom();

    if (!room) {
      return new Response(JSON.stringify({ error: 'Room not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Host rejoin by name
    if (room.host_name === playerName) {
      return new Response(JSON.stringify({
        success: true,
        playerId: room.host_id,
        playerName: room.host_name,
        partnerName: room.partner_name,
        phase: room.phase,
        dailySeed: room.daily_seed,
        isHost: true
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Partner rejoin by name
    if (room.partner_id && room.partner_name === playerName) {
      return new Response(JSON.stringify({
        success: true,
        playerId: room.partner_id,
        playerName: room.partner_name,
        partnerName: room.host_name,
        phase: room.phase,
        dailySeed: room.daily_seed,
        isHost: false
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Room full
    if (room.partner_id) {
      return new Response(JSON.stringify({ error: 'Room already has two players' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Add partner
    const partnerId = crypto.randomUUID();
    this.updateRoom({
      partner_id: partnerId,
      partner_name: playerName,
      phase: 'selecting',
      last_activity: Date.now()
    });

    this.sendToPlayer(room.host_id, {
      type: 'partner_joined',
      partnerId,
      partnerName: playerName
    });
    this.sendToPlayer(partnerId, {
      type: 'partner_joined',
      partnerId: room.host_id,
      partnerName: room.host_name
    });

    return new Response(JSON.stringify({
      success: true,
      playerId: partnerId,
      playerName,
      partnerName: room.host_name,
      phase: 'selecting',
      dailySeed: room.daily_seed,
      isHost: false
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async leaveGame(request) {
    const playerId = request.headers.get('X-Player-ID');
    const room = this.getRoom();

    if (!room) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Notify others before cleanup
    this.broadcastToRoom({ type: 'partner_left', playerId }, playerId);

    if (playerId === room.host_id) {
      // Host leaves = destroy room + marks
      this.sql.exec('DELETE FROM room WHERE id = 1');
      this.sql.exec('DELETE FROM marks');
    } else if (playerId === room.partner_id) {
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
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // --- Task 4: Select Squares (Simultaneous) ---

  async selectSquares(request) {
    const playerId = request.headers.get('X-Player-ID');
    const { squares } = await request.json();
    const room = this.getRoom();

    if (!room) {
      return new Response(JSON.stringify({ error: 'Room not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (room.phase !== 'selecting') {
      return new Response(JSON.stringify({ error: 'Not in selection phase' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const isHost = playerId === room.host_id;
    const isPartner = playerId === room.partner_id;

    if (!isHost && !isPartner) {
      return new Response(JSON.stringify({ error: 'Player not in room' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate squares: exactly 5 unique indices 0-24
    if (!Array.isArray(squares) || squares.length !== 5) {
      return new Response(JSON.stringify({ error: 'Must select exactly 5 squares' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const uniqueSet = new Set(squares);
    if (uniqueSet.size !== 5) {
      return new Response(JSON.stringify({ error: 'Squares must be unique' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!squares.every(s => Number.isInteger(s) && s >= 0 && s <= 24)) {
      return new Response(JSON.stringify({ error: 'Squares must be integers 0-24' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Already submitted?
    const alreadyReady = isHost ? room.host_ready : room.partner_ready;
    if (alreadyReady) {
      return new Response(JSON.stringify({ error: 'Already submitted squares' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Store selection + set ready flag
    const squaresField = isHost ? 'host_squares' : 'partner_squares';
    const readyField = isHost ? 'host_ready' : 'partner_ready';
    this.updateRoom({ [squaresField]: squares, [readyField]: true, last_activity: Date.now() });

    // Notify partner that this player is ready
    const partnerId = isHost ? room.partner_id : room.host_id;
    this.sendToPlayer(partnerId, { type: 'partner_ready' });

    // Check if both ready
    const updatedRoom = this.getRoom();
    if (updatedRoom.host_ready && updatedRoom.partner_ready) {
      // Both selected -> playing
      this.updateRoom({ phase: 'playing' });
      this.broadcastToRoom({ type: 'both_selected', phase: 'playing' });

      return new Response(JSON.stringify({
        success: true,
        phase: 'playing'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      waiting: true
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // --- Task 5: Mark Square (Toggle + Scoring) ---

  async markSquare(request) {
    const playerId = request.headers.get('X-Player-ID');
    const { index } = await request.json();
    const room = this.getRoom();

    if (!room) {
      return new Response(JSON.stringify({ error: 'Room not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (room.phase !== 'playing') {
      return new Response(JSON.stringify({ error: 'Game not in playing phase' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (index < 0 || index > 24) {
      return new Response(JSON.stringify({ error: 'Invalid square index' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const isHost = playerId === room.host_id;
    const isPartner = playerId === room.partner_id;
    if (!isHost && !isPartner) {
      return new Response(JSON.stringify({ error: 'Player not in room' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if already marked
    const existing = this.sql.exec('SELECT marked_by FROM marks WHERE idx = ?', index).toArray()[0];

    if (existing) {
      // Toggle off — only original marker can unmark
      if (existing.marked_by !== playerId) {
        return new Response(JSON.stringify({ error: 'Only the original marker can unmark' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      this.sql.exec('DELETE FROM marks WHERE idx = ?', index);
      const scores = this.computeScores(room);

      this.broadcastToRoom({
        type: 'square_unmarked',
        index,
        markedBy: playerId,
        hostScore: scores.hostScore,
        partnerScore: scores.partnerScore
      });

      const myScore = isHost ? scores.hostScore : scores.partnerScore;
      const partnerScore = isHost ? scores.partnerScore : scores.hostScore;

      return new Response(JSON.stringify({
        success: true,
        myScore,
        partnerScore,
        gameOver: false
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Mark the square
    this.sql.exec(
      'INSERT INTO marks (idx, marked_by, marked_at) VALUES (?, ?, ?)',
      index, playerId, Date.now()
    );

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
  }

  // --- Task 6: getState, Snapshot, Daily Reset ---

  async getState(request) {
    const playerId = request.headers.get('X-Player-ID');
    let room = this.getRoom();

    if (!room) {
      return new Response(JSON.stringify({ error: 'Room not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check daily reset
    const currentDate = getTodayUTC();
    if (currentDate !== room.daily_seed) {
      this.performDailyReset(room, currentDate);
      room = this.getRoom();
    }

    const isHost = playerId === room.host_id;
    const marks = this.getMarks();
    const scores = this.computeScores(room);
    const myScore = isHost ? scores.hostScore : scores.partnerScore;
    const partnerScoreVal = isHost ? scores.partnerScore : scores.hostScore;
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
      myScore,
      partnerScore: partnerScoreVal,
      card
    };

    // Phase-specific fields
    if (room.phase === 'selecting') {
      response.isMyTurnToPick = this.isPickTurn(playerId, room);
      response.myLine = isHost ? room.host_line : room.partner_line;
      response.partnerHasSelected = isHost ? !!room.partner_line : !!room.host_line;
    }

    if (room.phase === 'playing') {
      response.myLine = isHost ? room.host_line : room.partner_line;
      // Hide partner line during play
    }

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

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  performDailyReset(room, newSeed) {
    // Snapshot current game if it was in playing or finished
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

    // Clear marks
    this.sql.exec('DELETE FROM marks');

    // Compute new pick order
    const seed = dateToSeed(newSeed);
    const hostFirstPick = seed % 2 === 0;

    // Update room
    const newPhase = room.partner_id ? 'selecting' : 'waiting';
    this.updateRoom({
      daily_seed: newSeed,
      host_first_pick: hostFirstPick,
      host_line: null,
      partner_line: null,
      phase: newPhase,
      last_activity: Date.now()
    });

    this.broadcastToRoom({ type: 'daily_reset', dailySeed: newSeed });
  }

  async getSnapshot(request) {
    const playerId = request.headers.get('X-Player-ID');
    const room = this.getRoom();

    if (!room) {
      return new Response(JSON.stringify({ error: 'Room not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Yesterday's date UTC
    const now = new Date();
    now.setUTCDate(now.getUTCDate() - 1);
    const yesterday = now.toISOString().split('T')[0];

    const row = this.sql.exec('SELECT * FROM snapshots WHERE date = ?', yesterday).toArray()[0];
    if (!row) {
      return new Response(JSON.stringify({ snapshot: null }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Player-aware mapping
    const isHost = playerId === row.host_id;
    return new Response(JSON.stringify({
      snapshot: {
        date: row.date,
        myName: isHost ? row.host_name : row.partner_name,
        partnerName: isHost ? row.partner_name : row.host_name,
        myScore: isHost ? row.host_score : row.partner_score,
        partnerScore: isHost ? row.partner_score : row.host_score,
        winner: row.winner,
        myLine: isHost ? JSON.parse(row.host_line) : JSON.parse(row.partner_line),
        partnerLine: isHost ? JSON.parse(row.partner_line) : JSON.parse(row.host_line),
        marks: JSON.parse(row.marks_json)
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // --- Task 7: WebSocket Handler ---

  async handleWebSocket(request) {
    const { 0: client, 1: server } = new WebSocketPair();

    server.accept();

    const playerId = new URL(request.url).searchParams.get('playerId');
    if (playerId) {
      this.sessions.set(playerId, server);

      const room = this.getRoom();

      if (room) {
        const isHost = playerId === room.host_id;
        const connectMsg = {
          type: 'connected',
          phase: room.phase,
          isHost,
          hostName: room.host_name,
          partnerName: room.partner_name,
          isPaired: !!room.partner_id
        };

        // Include pick turn info if in selecting phase
        if (room.phase === 'selecting') {
          connectMsg.isMyTurnToPick = this.isPickTurn(playerId, room);
        }

        server.send(JSON.stringify(connectMsg));
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
          // Silently ignore parse errors
        }
      });
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  // Broadcast to all connected players
  broadcastToRoom(message, excludePlayerId = null) {
    const messageString = JSON.stringify(message);

    this.sessions.forEach((socket, playerId) => {
      if (excludePlayerId && playerId === excludePlayerId) return;

      try {
        socket.send(messageString);
      } catch (error) {
        this.sessions.delete(playerId);
      }
    });
  }

  // Send to specific player
  sendToPlayer(playerId, message) {
    const socket = this.sessions.get(playerId);
    if (socket) {
      try {
        socket.send(JSON.stringify(message));
      } catch (error) {
        this.sessions.delete(playerId);
      }
    }
  }
}
