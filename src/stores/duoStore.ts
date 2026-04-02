// Duo Store - Manages duo pairing and game state
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { BingoSquare } from '../types';
import {
  generateDailyCard,
  getTodayDateString,
  hasNewDayStarted,
  getLineIndices,
} from '../lib/dailyCard';
import {
  createDuoGame,
  joinDuoGame,
  selectLine as apiSelectLine,
  markSquare as apiMarkSquare,
  leaveDuoGame,
  fetchSnapshot,
} from '../lib/api';
import type { DuoSnapshotResponse } from '../lib/api';
import { useConnectionStore } from './connectionStore';

// Line selection type
export interface LineSelection {
  type: 'row' | 'col' | 'diag';
  index: number; // 0-4 for rows/cols, 0-1 for diagonals
}

// Mark entry
export interface MarkEntry {
  index: number;
  markedBy: string;
}

// Game phase
export type DuoPhase = 'unpaired' | 'waiting' | 'selecting' | 'playing' | 'finished';

// Yesterday snapshot
export interface YesterdaySnapshot {
  date: string;
  myLine: LineSelection | null;
  partnerLine: LineSelection | null;
  marks: MarkEntry[];
  myScore: number;
  partnerScore: number;
  winner: string | null;
}

// Duo state interface
interface DuoState {
  // Pairing
  pairCode: string | null;
  odId: string | null;
  odName: string | null;
  partnerId: string | null;
  partnerName: string | null;
  isPaired: boolean;
  isHost: boolean;

  // Phase
  phase: DuoPhase;

  // Line Selection
  myLine: LineSelection | null;
  isMyTurnToPick: boolean;
  partnerHasSelected: boolean;

  // Daily Card
  dailyCard: BingoSquare[];
  dailySeed: string;

  // Game State - server is source of truth for scores
  marks: MarkEntry[];
  myScore: number;
  partnerScore: number;
  gameOver: boolean;
  winner: 'me' | 'partner' | 'tie' | null;
  partnerLine: LineSelection | null; // only in finished phase

  // Snapshot
  snapshot: YesterdaySnapshot | null;
}

// Actions interface
interface DuoActions {
  // Pairing
  createGame: (playerName: string) => Promise<{ success: boolean; code?: string; error?: string }>;
  joinGame: (code: string, playerName: string) => Promise<{ success: boolean; error?: string }>;
  leaveGame: () => void;

  // Line Selection
  selectLine: (line: LineSelection) => Promise<{ success: boolean; error?: string }>;

  // Game Actions
  markSquare: (index: number) => Promise<void>;

  // Sync handlers
  syncState: (state: Partial<DuoState>) => void;
  handlePartnerJoined: (partner: { id: string; name: string }) => void;
  handlePartnerLeft: () => void;
  handleYourTurnToPick: () => void;
  handleBothSelected: () => void;
  handleSquareMarked: (index: number, markedBy: string, myScore: number, partnerScore: number) => void;
  handleSquareUnmarked: (index: number, markedBy: string | undefined, myScore: number, partnerScore: number) => void;
  handleGameOver: (winner: string, myScore: number, partnerScore: number, hostLine: LineSelection, partnerLine: LineSelection) => void;
  handleDailyReset: (newSeed: string) => void;

  // Utilities
  checkDailyReset: () => boolean;
  getMyLineIndices: () => number[];
  getPartnerLineIndices: () => number[];
  loadSnapshot: () => Promise<void>;
}

type DuoStore = DuoState & DuoActions;

// Initial state
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

  snapshot: null,
};

export const useDuoStore = create<DuoStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        // Create a new game as host
        createGame: async (playerName: string) => {
          const response = await createDuoGame(playerName, 'UTC');

          if (!response.success || !response.data) {
            return { success: false, error: response.error || 'Failed to create game' };
          }

          const { code, playerId, dailySeed } = response.data;

          set({
            pairCode: code,
            odId: playerId,
            odName: playerName,
            isHost: true,
            isPaired: false,
            phase: 'waiting',
            dailySeed,
          });

          // Connect WebSocket
          useConnectionStore.getState().connect(code, playerId);

          return { success: true, code };
        },

        // Join existing game as partner
        joinGame: async (code: string, playerName: string) => {
          const response = await joinDuoGame(code.toUpperCase(), playerName);

          if (!response.success || !response.data) {
            return { success: false, error: response.error || 'Failed to join game' };
          }

          const { playerId, partnerName, phase, dailySeed, isHost } = response.data;

          set({
            pairCode: code.toUpperCase(),
            odId: playerId,
            odName: playerName,
            partnerName: partnerName,
            isHost: isHost,
            isPaired: true,
            phase: phase as DuoPhase,
            dailySeed,
          });

          // Connect WebSocket
          useConnectionStore.getState().connect(code.toUpperCase(), playerId);

          return { success: true };
        },

        // Leave current game
        leaveGame: () => {
          const state = get();

          if (state.pairCode && state.odId) {
            leaveDuoGame(state.pairCode, state.odId);
          }

          // Disconnect WebSocket
          useConnectionStore.getState().disconnect();

          set(initialState);
        },

        // Select a line
        selectLine: async (line: LineSelection) => {
          const state = get();

          if (!state.pairCode || !state.odId) {
            return { success: false, error: 'Not in a game' };
          }

          const response = await apiSelectLine(state.pairCode, state.odId, line);

          if (!response.success || !response.data) {
            return { success: false, error: response.error || 'Failed to select line' };
          }

          if (!response.data.success) {
            return { success: false, error: response.data.error || 'Selection failed' };
          }

          // Update local state
          set({ myLine: line, isMyTurnToPick: false });

          // If both selected, server will send BOTH_SELECTED via WS
          return { success: true };
        },

        // Mark a square (toggle)
        markSquare: async (index: number) => {
          const state = get();

          if (state.phase !== 'playing') return;
          if (!state.pairCode || !state.odId) return;

          // Check if already marked by me (toggle = unmark)
          const existingMark = state.marks.find(m => m.index === index && m.markedBy === state.odId);

          if (existingMark) {
            // Optimistic unmark
            set({ marks: state.marks.filter(m => !(m.index === index && m.markedBy === state.odId)) });
          } else {
            // Optimistic mark
            set({ marks: [...state.marks, { index, markedBy: state.odId! }] });
          }

          // Send to server - server confirms with scores
          const response = await apiMarkSquare(state.pairCode, state.odId, index);

          if (response.success && response.data) {
            // Server confirmed - update scores
            set({
              myScore: response.data.myScore,
              partnerScore: response.data.partnerScore,
            });

            if (response.data.gameOver) {
              // Game over will come via WS message
            }
          }
        },

        // Sync full state from backend
        syncState: (newState: Partial<DuoState>) => {
          set(newState);
        },

        // Handle partner joined event
        handlePartnerJoined: (partner) => {
          set({
            partnerId: partner.id,
            partnerName: partner.name,
            isPaired: true,
            phase: 'selecting',
          });
        },

        // Handle partner left
        handlePartnerLeft: () => {
          set({
            partnerId: null,
            partnerName: null,
            isPaired: false,
            phase: 'waiting',
            myLine: null,
            isMyTurnToPick: false,
            partnerHasSelected: false,
            partnerLine: null,
            marks: [],
            myScore: 0,
            partnerScore: 0,
            gameOver: false,
            winner: null,
          });
        },

        // Handle your turn to pick
        handleYourTurnToPick: () => {
          set({ isMyTurnToPick: true });
        },

        // Handle both selected - transition to playing
        handleBothSelected: () => {
          const state = get();
          const card = generateDailyCard(state.dailySeed || getTodayDateString());
          set({
            dailyCard: card,
            phase: 'playing',
            partnerHasSelected: true,
          });
        },

        // Handle square marked by anyone
        handleSquareMarked: (index: number, markedBy: string, myScore: number, partnerScore: number) => {
          const state = get();
          // Add mark if not already present
          const alreadyMarked = state.marks.some(m => m.index === index && m.markedBy === markedBy);
          const newMarks = alreadyMarked ? state.marks : [...state.marks, { index, markedBy }];

          set({
            marks: newMarks,
            myScore,
            partnerScore,
          });
        },

        // Handle square unmarked
        handleSquareUnmarked: (index: number, markedBy: string | undefined, myScore: number, partnerScore: number) => {
          const state = get();
          set({
            marks: markedBy
              ? state.marks.filter(m => !(m.index === index && m.markedBy === markedBy))
              : state.marks.filter(m => m.index !== index),
            myScore,
            partnerScore,
          });
        },

        // Handle game over
        handleGameOver: (winner: string, myScore: number, partnerScore: number, hostLine: LineSelection, partnerLine: LineSelection) => {
          const state = get();
          const isHost = state.isHost;
          const myLine = isHost ? hostLine : partnerLine;
          const theirLine = isHost ? partnerLine : hostLine;

          // Map winner to me/partner/tie
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
            winner: winnerValue,
            myScore,
            partnerScore,
            myLine: myLine,
            partnerLine: theirLine,
          });
        },

        // Handle daily reset
        handleDailyReset: (newSeed: string) => {
          const state = get();

          set({
            myLine: null,
            partnerLine: null,
            isMyTurnToPick: false,
            partnerHasSelected: false,
            dailyCard: [],
            dailySeed: newSeed,
            marks: [],
            myScore: 0,
            partnerScore: 0,
            gameOver: false,
            winner: null,
            snapshot: null,
            phase: state.isPaired ? 'selecting' : 'unpaired',
          });
        },

        // Check if daily reset is needed
        checkDailyReset: () => {
          const state = get();
          if (!state.dailySeed) return false;

          if (hasNewDayStarted(state.dailySeed)) {
            get().handleDailyReset(getTodayDateString());
            return true;
          }
          return false;
        },

        // Get indices for my line
        getMyLineIndices: () => {
          const state = get();
          return state.myLine ? getLineIndices(state.myLine) : [];
        },

        // Get indices for partner's line
        getPartnerLineIndices: () => {
          const state = get();
          return state.partnerLine ? getLineIndices(state.partnerLine) : [];
        },

        // Load yesterday's snapshot
        loadSnapshot: async () => {
          const state = get();
          if (!state.pairCode || !state.odId) return;

          const response = await fetchSnapshot(state.pairCode, state.odId);
          if (response.success && response.data) {
            const snap = response.data as DuoSnapshotResponse;
            set({
              snapshot: {
                date: snap.date,
                myLine: snap.myLine,
                partnerLine: snap.partnerLine,
                marks: snap.marks,
                myScore: snap.myScore,
                partnerScore: snap.partnerScore,
                winner: snap.winner,
              },
            });
          }
        },
      }),
      {
        name: 'duo-storage',
        partialize: (state) => ({
          pairCode: state.pairCode,
          odId: state.odId,
          odName: state.odName,
          partnerId: state.partnerId,
          partnerName: state.partnerName,
          isPaired: state.isPaired,
          isHost: state.isHost,
          phase: state.phase,
          myLine: state.myLine,
          isMyTurnToPick: state.isMyTurnToPick,
          partnerHasSelected: state.partnerHasSelected,
          dailySeed: state.dailySeed,
          marks: state.marks,
          myScore: state.myScore,
          partnerScore: state.partnerScore,
          gameOver: state.gameOver,
          winner: state.winner,
          partnerLine: state.partnerLine,
        }),
        onRehydrateStorage: () => (state) => {
          if (!state) return;
          // Reset stale sessions: if phase isn't unpaired but date changed, room is dead
          if (state.phase !== 'unpaired' && state.dailySeed) {
            if (hasNewDayStarted(state.dailySeed)) {
              useDuoStore.setState(initialState);
              return;
            }
          }
          // Reset waiting/selecting if no pair code (corrupt state)
          if (state.phase !== 'unpaired' && !state.pairCode) {
            useDuoStore.setState(initialState);
          }
        },
      }
    )
  )
);

// Export utility for regenerating card on load
export function regenerateDailyCardIfNeeded(): void {
  const state = useDuoStore.getState();

  // Check for daily reset first
  if (state.dailySeed && hasNewDayStarted(state.dailySeed)) {
    useDuoStore.getState().handleDailyReset(getTodayDateString());
    return;
  }

  // Regenerate card from seed if in playing/finished phase but card is empty
  if ((state.phase === 'playing' || state.phase === 'finished') && state.dailySeed && state.dailyCard.length === 0) {
    const card = generateDailyCard(state.dailySeed);
    useDuoStore.setState({ dailyCard: card });
  }

  // Reconnect WebSocket if we have session data
  if (state.pairCode && state.odId && state.phase !== 'unpaired') {
    useConnectionStore.getState().connect(state.pairCode, state.odId);
  }
}
