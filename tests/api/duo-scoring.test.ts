// @vitest-environment node
import { describe, it, expect } from 'vitest';

const API_BASE = 'https://jargon-api.playjargon.workers.dev/api/duo';

async function api(method: string, path: string, body?: any, playerId?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (playerId) headers['X-Player-ID'] = playerId;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function setupPlayingRoom() {
  // Server generates its own playerIds — use the ones it returns
  const createRes = await api('POST', '/create', { playerName: 'TestHost' });
  const code = createRes.code;
  const hostId = createRes.playerId;

  const joinRes = await api('POST', '/join', { code, playerName: 'TestPartner' });
  const partnerId = joinRes.playerId;

  const state = await api('GET', `/${code}/state`, undefined, hostId);

  // Host picks row 0, partner picks row 4
  if (state.isMyTurnToPick) {
    await api('POST', `/${code}/select`, { line: { type: 'row', index: 0 } }, hostId);
    await api('POST', `/${code}/select`, { line: { type: 'row', index: 4 } }, partnerId);
  } else {
    await api('POST', `/${code}/select`, { line: { type: 'row', index: 4 } }, partnerId);
    await api('POST', `/${code}/select`, { line: { type: 'row', index: 0 } }, hostId);
  }

  return { code, hostId, partnerId };
}

describe('Duo Scoring API', () => {
  describe('scoring math', () => {
    it('1 mark = 1 point', async () => {
      const { code, hostId } = await setupPlayingRoom();
      const res = await api('POST', `/${code}/mark`, { index: 12 }, hostId);
      expect(res.success).toBe(true);
      expect(res.myScore).toBe(1);
      expect(res.gameOver).toBe(false);
    }, 15000);

    it('5 scattered marks without completing a line = 5 points', async () => {
      const { code, hostId } = await setupPlayingRoom();
      // These 5 squares don't form any row, col, or diagonal
      for (const idx of [1, 7, 13, 19, 22]) {
        await api('POST', `/${code}/mark`, { index: idx }, hostId);
      }
      const state = await api('GET', `/${code}/state`, undefined, hostId);
      expect(state.myScore).toBe(5);
    }, 15000);

    it('completing a bingo line = marks + 3 bonus', async () => {
      const { code, hostId } = await setupPlayingRoom();
      // Complete col 2 (indices 2,7,12,17,22) — not either secret line
      for (const idx of [2, 7, 12, 17, 22]) {
        await api('POST', `/${code}/mark`, { index: idx }, hostId);
      }
      const state = await api('GET', `/${code}/state`, undefined, hostId);
      expect(state.myScore).toBe(8); // 5 marks + 1 line * 3
      expect(state.phase).toBe('playing');
    }, 15000);

    it('unmark breaks a line and removes bonus', async () => {
      const { code, hostId } = await setupPlayingRoom();
      for (const idx of [2, 7, 12, 17, 22]) {
        await api('POST', `/${code}/mark`, { index: idx }, hostId);
      }
      let state = await api('GET', `/${code}/state`, undefined, hostId);
      expect(state.myScore).toBe(8);

      // Unmark square 12 (toggle)
      await api('POST', `/${code}/mark`, { index: 12 }, hostId);
      state = await api('GET', `/${code}/state`, undefined, hostId);
      expect(state.myScore).toBe(4); // 4 marks, 0 lines
    }, 15000);
  });

  describe('bonus bingo', () => {
    it('completing opponent secret line triggers instant win', async () => {
      const { code, hostId } = await setupPlayingRoom();
      // Host marks partner's secret line (row 4 = indices 20,21,22,23,24)
      for (const idx of [20, 21, 22, 23, 24]) {
        const res = await api('POST', `/${code}/mark`, { index: idx }, hostId);
        if (idx === 24) {
          expect(res.gameOver).toBe(true);
          expect(res.bonusBingo).toBe(true);
        } else {
          expect(res.gameOver).toBe(false);
        }
      }
      const state = await api('GET', `/${code}/state`, undefined, hostId);
      expect(state.phase).toBe('finished');
      expect(state.winner).toBe('host');
    }, 15000);

    it('completing a non-secret line does NOT trigger game over', async () => {
      const { code, hostId } = await setupPlayingRoom();
      // Row 2 (10,11,12,13,14) — not either secret line
      for (const idx of [10, 11, 12, 13, 14]) {
        const res = await api('POST', `/${code}/mark`, { index: idx }, hostId);
        expect(res.gameOver).toBe(false);
      }
      const state = await api('GET', `/${code}/state`, undefined, hostId);
      expect(state.phase).toBe('playing');
    }, 15000);

    it('shared marks can trigger bonus bingo', async () => {
      const { code, hostId, partnerId } = await setupPlayingRoom();
      // Partner's secret line = row 4 (20,21,22,23,24)
      await api('POST', `/${code}/mark`, { index: 20 }, hostId);
      await api('POST', `/${code}/mark`, { index: 21 }, hostId);
      await api('POST', `/${code}/mark`, { index: 22 }, partnerId);
      await api('POST', `/${code}/mark`, { index: 23 }, partnerId);
      // Host marks final square
      const res = await api('POST', `/${code}/mark`, { index: 24 }, hostId);
      expect(res.gameOver).toBe(true);
      expect(res.bonusBingo).toBe(true);
    }, 15000);
  });

  describe('score verification', () => {
    it('both players scores are independent', async () => {
      const { code, hostId, partnerId } = await setupPlayingRoom();
      // Host marks 3
      await api('POST', `/${code}/mark`, { index: 6 }, hostId);
      await api('POST', `/${code}/mark`, { index: 7 }, hostId);
      await api('POST', `/${code}/mark`, { index: 8 }, hostId);
      // Partner marks 1
      await api('POST', `/${code}/mark`, { index: 15 }, partnerId);

      const hostState = await api('GET', `/${code}/state`, undefined, hostId);
      const partnerState = await api('GET', `/${code}/state`, undefined, partnerId);

      // Host: 3 marks. Partner: 1 mark. Both see shared completed lines.
      // No lines complete from these 4 scattered squares.
      expect(hostState.myScore).toBe(3);
      expect(hostState.partnerScore).toBe(1);
      expect(partnerState.myScore).toBe(1);
      expect(partnerState.partnerScore).toBe(3);
    }, 15000);
  });

  describe('edge cases', () => {
    it('toggle (unmark + remark) recalculates correctly', async () => {
      const { code, hostId } = await setupPlayingRoom();
      await api('POST', `/${code}/mark`, { index: 12 }, hostId);
      let state = await api('GET', `/${code}/state`, undefined, hostId);
      expect(state.myScore).toBe(1);

      await api('POST', `/${code}/mark`, { index: 12 }, hostId);
      state = await api('GET', `/${code}/state`, undefined, hostId);
      expect(state.myScore).toBe(0);

      await api('POST', `/${code}/mark`, { index: 12 }, hostId);
      state = await api('GET', `/${code}/state`, undefined, hostId);
      expect(state.myScore).toBe(1);
    }, 15000);
  });
});
