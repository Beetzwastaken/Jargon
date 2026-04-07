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
      useDuoStore.getState().handleDailyReset('2026-04-08');
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
