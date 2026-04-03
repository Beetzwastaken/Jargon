import { describe, it, expect, beforeEach } from 'vitest';
import { useDuoStore } from '../../src/stores/duoStore';

describe('duoStore scoring handlers', () => {
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
      myLine: { type: 'row', index: 0 },
      partnerLine: null,
      isMyTurnToPick: false,
      partnerHasSelected: true,
      dailyCard: [],
      dailySeed: '2026-04-03',
      marks: [],
      myScore: 0,
      partnerScore: 0,
      gameOver: false,
      bonusBingo: false,
      winner: null,
      snapshot: null,
    });
  });

  describe('handleGameOver', () => {
    it('sets bonusBingo true when bonus bingo', () => {
      const store = useDuoStore.getState();
      store.handleGameOver('host', 15, 8,
        { type: 'row', index: 0 },
        { type: 'col', index: 2 },
        true
      );

      const state = useDuoStore.getState();
      expect(state.bonusBingo).toBe(true);
      expect(state.winner).toBe('me');
      expect(state.phase).toBe('finished');
      expect(state.gameOver).toBe(true);
      expect(state.myScore).toBe(15);
      expect(state.partnerScore).toBe(8);
    });

    it('sets bonusBingo false for score-based win', () => {
      const store = useDuoStore.getState();
      store.handleGameOver('host', 20, 12,
        { type: 'row', index: 0 },
        { type: 'col', index: 2 },
        false
      );

      const state = useDuoStore.getState();
      expect(state.bonusBingo).toBe(false);
      expect(state.winner).toBe('me');
    });

    it('defaults bonusBingo to false when not provided', () => {
      const store = useDuoStore.getState();
      store.handleGameOver('host', 20, 12,
        { type: 'row', index: 0 },
        { type: 'col', index: 2 }
      );

      const state = useDuoStore.getState();
      expect(state.bonusBingo).toBe(false);
    });

    it('maps partner winner correctly when I am host', () => {
      const store = useDuoStore.getState();
      store.handleGameOver('partner', 8, 15,
        { type: 'row', index: 0 },
        { type: 'col', index: 2 },
        true
      );

      const state = useDuoStore.getState();
      expect(state.winner).toBe('partner');
    });

    it('maps host winner correctly when I am partner', () => {
      useDuoStore.setState({ isHost: false });

      const store = useDuoStore.getState();
      store.handleGameOver('host', 15, 8,
        { type: 'row', index: 0 },
        { type: 'col', index: 2 },
        false
      );

      const state = useDuoStore.getState();
      expect(state.winner).toBe('partner');
    });

    it('handles tie', () => {
      const store = useDuoStore.getState();
      store.handleGameOver('tie', 12, 12,
        { type: 'row', index: 0 },
        { type: 'col', index: 2 },
        false
      );

      const state = useDuoStore.getState();
      expect(state.winner).toBe('tie');
    });

    it('stores both lines on game over', () => {
      const hostLine = { type: 'row' as const, index: 0 };
      const partnerLine = { type: 'col' as const, index: 2 };

      const store = useDuoStore.getState();
      store.handleGameOver('host', 15, 8, hostLine, partnerLine, true);

      const state = useDuoStore.getState();
      expect(state.myLine).toEqual(hostLine);
      expect(state.partnerLine).toEqual(partnerLine);
    });
  });

  describe('handleDailyReset', () => {
    it('resets bonusBingo to false', () => {
      useDuoStore.setState({ bonusBingo: true, gameOver: true, myScore: 20 });

      const store = useDuoStore.getState();
      store.handleDailyReset('2026-04-04');

      const state = useDuoStore.getState();
      expect(state.bonusBingo).toBe(false);
      expect(state.gameOver).toBe(false);
      expect(state.myScore).toBe(0);
      expect(state.partnerScore).toBe(0);
      expect(state.winner).toBe(null);
      expect(state.marks).toEqual([]);
    });

    it('resets to selecting phase when paired', () => {
      useDuoStore.setState({ isPaired: true, bonusBingo: true });

      const store = useDuoStore.getState();
      store.handleDailyReset('2026-04-04');

      const state = useDuoStore.getState();
      expect(state.phase).toBe('selecting');
    });

    it('resets to unpaired phase when not paired', () => {
      useDuoStore.setState({ isPaired: false, bonusBingo: true });

      const store = useDuoStore.getState();
      store.handleDailyReset('2026-04-04');

      const state = useDuoStore.getState();
      expect(state.phase).toBe('unpaired');
    });
  });
});
