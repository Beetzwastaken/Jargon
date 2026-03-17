// Jargon - Duo Mode Backend
// Cloudflare Workers with Durable Objects for paired play

import { JARGON_PHRASES } from './src/data/buzzwords.js';
const BUZZWORDS = JARGON_PHRASES;

// Import and re-export DashboardAnalytics for wrangler
export { DashboardAnalytics } from './analytics-worker.js';

// CORS helper
function corsHeaders(origin) {
  const allowedOrigins = [
    'https://corporate-bingo-ai.netlify.app',
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

// Get today's date in timezone
function getTodayInTimezone(timezone) {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(now);
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

// Get line indices for scoring
function getLineIndices(line) {
  switch (line.type) {
    case 'row':
      const rowStart = line.index * 5;
      return [rowStart, rowStart + 1, rowStart + 2, rowStart + 3, rowStart + 4];
    case 'col':
      return [line.index, line.index + 5, line.index + 10, line.index + 15, line.index + 20];
    case 'diag':
      if (line.index === 0) return [0, 6, 12, 18, 24];
      else return [4, 8, 12, 16, 20];
    default:
      return [];
  }
}

// Check if line is complete
function isLineComplete(markedSquares, line) {
  const indices = getLineIndices(line);
  return indices.every(i => markedSquares[i]);
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

// BingoRoom Durable Object - Duo Mode
export class BingoRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map(); // playerId -> WebSocket
    this.room = null;
  }

  async fetch(request) {
    const url = new URL(request.url);

    try {
      // Duo endpoints
      if (url.pathname === '/duo/create') {
        return await this.createDuoGame(request);
      }
      if (url.pathname === '/duo/join') {
        return await this.joinDuoGame(request);
      }
      if (url.pathname === '/duo/select') {
        return await this.selectLine(request);
      }
      if (url.pathname === '/duo/mark') {
        return await this.markSquare(request);
      }
      if (url.pathname === '/duo/leave') {
        return await this.leaveGame(request);
      }
      if (url.pathname === '/duo/state') {
        return await this.getState(request);
      }
      if (url.pathname === '/exists') {
        return this.room ? new Response('exists') : new Response('not found', { status: 404 });
      }
      if (request.headers.get('Upgrade') === 'websocket') {
        return await this.handleWebSocket(request);
      }

      return new Response('Not found', { status: 404 });

    } catch (error) {
      return new Response(JSON.stringify({ error: 'Room processing error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Create duo game (host)
  async createDuoGame(request) {
    const { playerName, roomCode, timezone } = await request.json();

    const hostId = crypto.randomUUID();
    const dailySeed = getTodayInTimezone(timezone);

    this.room = {
      code: roomCode,
      pairTimezone: timezone,
      dailySeed,

      // Players
      hostId,
      hostName: playerName,
      partnerId: null,
      partnerName: null,

      // Phase: waiting -> selecting -> playing
      phase: 'waiting',

      // Line selections (hidden until both selected)
      hostLine: null,
      partnerLine: null,
      hostHasSelected: false,
      partnerHasSelected: false,

      // Shared game state
      markedSquares: Array(25).fill(false),
      hostScore: 0,
      partnerScore: 0,
      hostBingo: false,
      partnerBingo: false,

      // Metadata
      createdAt: Date.now(),
      lastActivity: Date.now()
    };

    await this.state.storage.put('room', this.room);

    return new Response(JSON.stringify({
      success: true,
      code: roomCode,
      playerId: hostId,
      playerName,
      timezone,
      dailySeed
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Join duo game (partner)
  async joinDuoGame(request) {
    const { playerName } = await request.json();

    if (!this.room) {
      this.room = await this.state.storage.get('room');
      if (!this.room) {
        return new Response(JSON.stringify({ error: 'Room not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Check if already paired
    if (this.room.partnerId) {
      // Check if rejoining
      if (this.room.partnerName === playerName) {
        return new Response(JSON.stringify({
          success: true,
          playerId: this.room.partnerId,
          playerName: this.room.partnerName,
          partnerName: this.room.hostName,
          phase: this.room.phase,
          timezone: this.room.pairTimezone,
          dailySeed: this.room.dailySeed,
          isHost: false
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ error: 'Room already has two players' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if host is rejoining
    if (this.room.hostName === playerName) {
      return new Response(JSON.stringify({
        success: true,
        playerId: this.room.hostId,
        playerName: this.room.hostName,
        partnerName: this.room.partnerName,
        phase: this.room.phase,
        timezone: this.room.pairTimezone,
        dailySeed: this.room.dailySeed,
        isHost: true
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Add partner
    const partnerId = crypto.randomUUID();
    this.room.partnerId = partnerId;
    this.room.partnerName = playerName;
    this.room.phase = 'selecting';
    this.room.lastActivity = Date.now();

    await this.state.storage.put('room', this.room);

    // Notify host via WebSocket
    this.broadcastToRoom({
      type: 'partner_joined',
      partnerId,
      partnerName: playerName
    });

    return new Response(JSON.stringify({
      success: true,
      playerId: partnerId,
      playerName,
      partnerName: this.room.hostName,
      phase: 'selecting',
      timezone: this.room.pairTimezone,
      dailySeed: this.room.dailySeed,
      isHost: false
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Select line (secret until both pick)
  async selectLine(request) {
    const playerId = request.headers.get('X-Player-ID');
    const { line } = await request.json();

    if (!this.room) {
      this.room = await this.state.storage.get('room');
      if (!this.room) {
        return new Response(JSON.stringify({ error: 'Room not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    if (this.room.phase !== 'selecting') {
      return new Response(JSON.stringify({ error: 'Not in selection phase' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const isHost = playerId === this.room.hostId;
    const isPartner = playerId === this.room.partnerId;

    if (!isHost && !isPartner) {
      return new Response(JSON.stringify({ error: 'Player not in room' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate line format
    if (!line || !['row', 'col', 'diag'].includes(line.type) || typeof line.index !== 'number') {
      return new Response(JSON.stringify({ error: 'Invalid line selection' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Store selection
    if (isHost) {
      this.room.hostLine = line;
      this.room.hostHasSelected = true;
    } else {
      this.room.partnerLine = line;
      this.room.partnerHasSelected = true;
    }

    this.room.lastActivity = Date.now();

    // Notify partner that selection was made (but not which line)
    this.broadcastToRoom({
      type: 'partner_selected',
      playerId
    }, playerId); // Exclude self

    // Check if both have selected -> reveal and start playing
    if (this.room.hostHasSelected && this.room.partnerHasSelected) {
      // Check for conflict (same line)
      const hostLine = this.room.hostLine;
      const partnerLine = this.room.partnerLine;

      if (hostLine.type === partnerLine.type && hostLine.index === partnerLine.index) {
        // Conflict! Partner must re-pick (first to select wins)
        this.room.partnerLine = null;
        this.room.partnerHasSelected = false;

        await this.state.storage.put('room', this.room);

        // Notify partner of conflict
        this.sendToPlayer(this.room.partnerId, {
          type: 'line_conflict',
          takenLine: hostLine,
          message: 'Your partner already picked that line. Choose another.'
        });

        return new Response(JSON.stringify({
          success: true,
          conflict: true,
          message: 'Line taken by partner'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // No conflict - reveal card and start playing
      this.room.phase = 'playing';

      await this.state.storage.put('room', this.room);

      // Generate the daily card
      const card = generateDailyCard(this.room.dailySeed);

      // Broadcast card reveal with both lines
      this.broadcastToRoom({
        type: 'card_revealed',
        hostLine: this.room.hostLine,
        partnerLine: this.room.partnerLine,
        card,
        hostScore: 0,
        partnerScore: 0
      });

      return new Response(JSON.stringify({
        success: true,
        phase: 'playing',
        hostLine: this.room.hostLine,
        partnerLine: this.room.partnerLine
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await this.state.storage.put('room', this.room);

    return new Response(JSON.stringify({
      success: true,
      waiting: !this.room.hostHasSelected || !this.room.partnerHasSelected
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Mark square (shared between both players)
  async markSquare(request) {
    const playerId = request.headers.get('X-Player-ID');
    const { index } = await request.json();

    if (!this.room) {
      this.room = await this.state.storage.get('room');
      if (!this.room) {
        return new Response(JSON.stringify({ error: 'Room not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    if (this.room.phase !== 'playing') {
      return new Response(JSON.stringify({ error: 'Game not in playing phase' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (index < 0 || index > 24 || this.room.markedSquares[index]) {
      return new Response(JSON.stringify({ error: 'Invalid or already marked' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Mark the square
    this.room.markedSquares[index] = true;

    // Calculate scores
    const hostLineIndices = getLineIndices(this.room.hostLine);
    const partnerLineIndices = getLineIndices(this.room.partnerLine);

    if (hostLineIndices.includes(index)) {
      this.room.hostScore += 1;
    }
    if (partnerLineIndices.includes(index)) {
      this.room.partnerScore += 1;
    }

    // Check for bingo
    let hostGotBingo = false;
    let partnerGotBingo = false;

    if (!this.room.hostBingo && isLineComplete(this.room.markedSquares, this.room.hostLine)) {
      this.room.hostBingo = true;
      this.room.hostScore += 5; // BINGO bonus
      hostGotBingo = true;
    }

    if (!this.room.partnerBingo && isLineComplete(this.room.markedSquares, this.room.partnerLine)) {
      this.room.partnerBingo = true;
      this.room.partnerScore += 5; // BINGO bonus
      partnerGotBingo = true;
    }

    this.room.lastActivity = Date.now();
    await this.state.storage.put('room', this.room);

    // Broadcast update
    this.broadcastToRoom({
      type: 'square_marked',
      index,
      markedBy: playerId,
      hostScore: this.room.hostScore,
      partnerScore: this.room.partnerScore,
      hostBingo: this.room.hostBingo,
      partnerBingo: this.room.partnerBingo
    });

    // Announce bingo if any
    if (hostGotBingo) {
      this.broadcastToRoom({
        type: 'bingo',
        player: 'host',
        playerName: this.room.hostName,
        score: this.room.hostScore
      });
    }
    if (partnerGotBingo) {
      this.broadcastToRoom({
        type: 'bingo',
        player: 'partner',
        playerName: this.room.partnerName,
        score: this.room.partnerScore
      });
    }

    return new Response(JSON.stringify({
      success: true,
      hostScore: this.room.hostScore,
      partnerScore: this.room.partnerScore
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Leave game
  async leaveGame(request) {
    const playerId = request.headers.get('X-Player-ID');

    if (!this.room) {
      this.room = await this.state.storage.get('room');
    }

    if (!this.room) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Notify partner
    this.broadcastToRoom({
      type: 'partner_left',
      playerId
    }, playerId);

    // If host leaves, room is destroyed
    if (playerId === this.room.hostId) {
      await this.state.storage.delete('room');
      this.room = null;
    } else if (playerId === this.room.partnerId) {
      // Partner leaves - reset to waiting
      this.room.partnerId = null;
      this.room.partnerName = null;
      this.room.phase = 'waiting';
      this.room.partnerLine = null;
      this.room.partnerHasSelected = false;
      this.room.markedSquares = Array(25).fill(false);
      this.room.hostScore = 0;
      this.room.partnerScore = 0;
      this.room.hostBingo = false;
      this.room.partnerBingo = false;
      this.room.hostLine = null;
      this.room.hostHasSelected = false;
      await this.state.storage.put('room', this.room);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Get current state (for polling/reconnection)
  async getState(request) {
    const playerId = request.headers.get('X-Player-ID');

    if (!this.room) {
      this.room = await this.state.storage.get('room');
      if (!this.room) {
        return new Response(JSON.stringify({ error: 'Room not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Check for daily reset
    const currentDate = getTodayInTimezone(this.room.pairTimezone);
    if (currentDate !== this.room.dailySeed) {
      // New day! Reset game state
      this.room.dailySeed = currentDate;
      this.room.phase = this.room.partnerId ? 'selecting' : 'waiting';
      this.room.hostLine = null;
      this.room.partnerLine = null;
      this.room.hostHasSelected = false;
      this.room.partnerHasSelected = false;
      this.room.markedSquares = Array(25).fill(false);
      this.room.hostScore = 0;
      this.room.partnerScore = 0;
      this.room.hostBingo = false;
      this.room.partnerBingo = false;

      await this.state.storage.put('room', this.room);

      // Notify players of reset
      this.broadcastToRoom({
        type: 'daily_reset',
        dailySeed: currentDate
      });
    }

    const isHost = playerId === this.room.hostId;

    // Build response based on phase
    const response = {
      code: this.room.code,
      phase: this.room.phase,
      timezone: this.room.pairTimezone,
      dailySeed: this.room.dailySeed,
      isHost,
      hostName: this.room.hostName,
      partnerName: this.room.partnerName,
      isPaired: !!this.room.partnerId
    };

    // Add game state if in playing phase
    if (this.room.phase === 'playing') {
      response.hostLine = this.room.hostLine;
      response.partnerLine = this.room.partnerLine;
      response.markedSquares = this.room.markedSquares;
      response.hostScore = this.room.hostScore;
      response.partnerScore = this.room.partnerScore;
      response.hostBingo = this.room.hostBingo;
      response.partnerBingo = this.room.partnerBingo;
      response.card = generateDailyCard(this.room.dailySeed);
    }

    // Add selection status if selecting
    if (this.room.phase === 'selecting') {
      response.myHasSelected = isHost ? this.room.hostHasSelected : this.room.partnerHasSelected;
      response.partnerHasSelected = isHost ? this.room.partnerHasSelected : this.room.hostHasSelected;
      // Show own line if selected
      if (isHost && this.room.hostLine) {
        response.myLine = this.room.hostLine;
      } else if (!isHost && this.room.partnerLine) {
        response.myLine = this.room.partnerLine;
      }
    }

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // WebSocket handling
  async handleWebSocket(request) {
    const { 0: client, 1: server } = new WebSocketPair();

    server.accept();

    const playerId = new URL(request.url).searchParams.get('playerId');
    if (playerId) {
      this.sessions.set(playerId, server);

      // Load room if needed
      if (!this.room) {
        this.room = await this.state.storage.get('room');
      }

      // Send current state on connect
      if (this.room) {
        const isHost = playerId === this.room.hostId;

        server.send(JSON.stringify({
          type: 'connected',
          phase: this.room.phase,
          isHost,
          hostName: this.room.hostName,
          partnerName: this.room.partnerName,
          isPaired: !!this.room.partnerId
        }));
      }

      server.addEventListener('close', () => {
        this.sessions.delete(playerId);
      });

      server.addEventListener('message', async (event) => {
        try {
          const data = JSON.parse(event.data);
          // Handle ping/pong for keepalive
          if (data.type === 'ping') {
            server.send(JSON.stringify({ type: 'pong' }));
          }
        } catch (e) {
          // Silently ignore message parse errors
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
