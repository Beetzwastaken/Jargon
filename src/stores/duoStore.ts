// Duo Store - Manages duo pairing and game state
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { BingoSquare } from '../types';
import type { BingoPlayer } from '../types/shared';
import {
  generateDailyCard,
  getTodayDateString,
  hasNewDayStarted,
  getLineIndices,
  isLineComplete
} from '../lib/dailyCard';
import {
  createDuoGame,
  joinDuoGame,
  selectLine as apiSelectLine,
  markSquare as apiMarkSquare,
  leaveDuoGame
} from '../lib/api';
import { useConnectionStore } from './connectionStore';

// Line selection type
export interface LineSelection {
  type: 'row' | 'col' | 'diag';
  index: number; // 0-4 for rows/cols, 0-1 for diagonals
}

// Game phase
export type DuoPhase = 'unpaired' | 'waiting' | 'selecting' | 'playing';

// Duo state interface
interface DuoState {
  // Pairing
  pairCode: string | null;
  odId: string | null;           // Own ID
  odName: string | null;         // Own name
  partnerId: string | null;
  partnerName: string | null;
  isPaired: boolean;
  isHost: boolean;
  pairTimezone: string;          // IANA timezone, locked at creation

  // Phase
  phase: DuoPhase;

  // Line Selection
  myLine: LineSelection | null;
  partnerLine: LineSelection | null;
  partnerHasSelected: boolean;   // True if partner picked (unknown which until reveal)

  // Daily Card
  dailyCard: BingoSquare[];
  dailySeed: string;             // YYYY-MM-DD

  // Game State
  markedSquares: boolean[];      // 25 booleans - shared between both players
  myScore: number;
  partnerScore: number;
  myBingo: boolean;
  partnerBingo: boolean;
}

// Actions interface
interface DuoActions {
  // Pairing
  createGame: (playerName: string) => Promise<{ success: boolean; code?: string; error?: string }>;
  joinGame: (code: string, playerName: string) => Promise<{ success: boolean; error?: string }>;
  leaveGame: () => void;

  // Line Selection
  selectLine: (line: LineSelection) => Promise<{ success: boolean; taken?: boolean; error?: string }>;

  // Game Actions
  markSquare: (index: number) => Promise<void>;

  // Sync
  syncState: (state: Partial<DuoState>) => void;
  handlePartnerJoined: (partner: BingoPlayer) => void;
  handlePartnerSelected: () => void;
  handleCardRevealed: (myLine: LineSelection, partnerLine: LineSelection) => void;
  handleSquareMarked: (index: number, myScore: number, partnerScore: number) => void;
  handleBingo: (player: 'me' | 'partner', myScore: number, partnerScore: number) => void;
  handleDailyReset: () => void;

  // Utilities
  checkDailyReset: () => boolean;
  getMyLineIndices: () => number[];
  getPartnerLineIndices: () => number[];
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
  pairTimezone: 'UTC',

  phase: 'unpaired',

  myLine: null,
  partnerLine: null,
  partnerHasSelected: false,

  dailyCard: [],
  dailySeed: '',

  markedSquares: Array(25).fill(false),
  myScore: 0,
  partnerScore: 0,
  myBingo: false,
  partnerBingo: false
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
            pairTimezone: 'UTC',
            dailySeed
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
            partnerId: isHost ? null : playerId, // Will be set properly on connect
            partnerName: partnerName,
            isHost: isHost,
            isPaired: !isHost, // Partner is paired immediately, host waits
            phase: phase as DuoPhase,
            pairTimezone: 'UTC',
            dailySeed
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

        // Select a line (secret until both pick)
        selectLine: async (line: LineSelection) => {
          const state = get();

          if (!state.pairCode || !state.odId) {
            return { success: false, error: 'Not in a game' };
          }

          const response = await apiSelectLine(state.pairCode, state.odId, line);

          if (!response.success || !response.data) {
            return { success: false, error: response.error || 'Failed to select line' };
          }

          if (response.data.conflict) {
            // Line was taken by partner
            return { success: false, taken: true, error: 'Line already taken' };
          }

          // Update local state
          set({ myLine: line });

          // If both have selected, card will be revealed via WebSocket
          if (response.data.phase === 'playing' && response.data.hostLine && response.data.partnerLine) {
            const isHost = state.isHost;
            const myLine = isHost ? response.data.hostLine : response.data.partnerLine;
            const theirLine = isHost ? response.data.partnerLine : response.data.hostLine;

            const card = generateDailyCard(state.dailySeed || getTodayDateString());
            set({
              myLine,
              partnerLine: theirLine,
              dailyCard: card,
              phase: 'playing'
            });
          }

          return { success: true };
        },

        // Mark a square
        markSquare: async (index: number) => {
          const state = get();

          if (state.phase !== 'playing') return;
          if (state.markedSquares[index]) return;
          if (!state.pairCode || !state.odId) return;

          // Optimistic update
          const newMarked = [...state.markedSquares];
          newMarked[index] = true;
          set({ markedSquares: newMarked });

          // Calculate scores locally
          let myScore = state.myScore;
          let partnerScore = state.partnerScore;

          if (state.myLine) {
            const myIndices = getLineIndices(state.myLine);
            if (myIndices.includes(index)) {
              myScore += 1;
            }
          }

          if (state.partnerLine) {
            const partnerIndices = getLineIndices(state.partnerLine);
            if (partnerIndices.includes(index)) {
              partnerScore += 1;
            }
          }

          // Check for bingo
          let myBingo = state.myBingo;
          let partnerBingo = state.partnerBingo;

          if (state.myLine && !myBingo && isLineComplete(newMarked, state.myLine)) {
            myBingo = true;
            myScore += 5;
          }

          if (state.partnerLine && !partnerBingo && isLineComplete(newMarked, state.partnerLine)) {
            partnerBingo = true;
            partnerScore += 5;
          }

          set({ myScore, partnerScore, myBingo, partnerBingo });

          // Send to server
          await apiMarkSquare(state.pairCode, state.odId, index);
        },

        // Sync full state from backend
        syncState: (newState: Partial<DuoState>) => {
          set(newState);
        },

        // Handle partner joined event
        handlePartnerJoined: (partner: BingoPlayer) => {
          set({
            partnerId: partner.id,
            partnerName: partner.name,
            isPaired: true,
            phase: 'selecting'
          });
        },

        // Handle partner selected their line (but we don't know which)
        handlePartnerSelected: () => {
          const state = get();
          set({ partnerHasSelected: true });

          // If we've also selected, transition to playing
          if (state.myLine) {
            const card = generateDailyCard(state.dailySeed || getTodayDateString());
            set({ dailyCard: card, phase: 'playing' });
          }
        },

        // Handle card reveal (both lines now visible)
        handleCardRevealed: (myLine: LineSelection, partnerLine: LineSelection) => {
          const state = get();
          const card = generateDailyCard(state.dailySeed || getTodayDateString());

          set({
            myLine,
            partnerLine,
            dailyCard: card,
            phase: 'playing'
          });
        },

        // Handle square marked by partner
        handleSquareMarked: (index: number, myScore: number, partnerScore: number) => {
          const state = get();
          const newMarked = [...state.markedSquares];
          newMarked[index] = true;

          // Check for bingo
          let myBingo = state.myBingo;
          let partnerBingo = state.partnerBingo;

          if (state.myLine && !myBingo && isLineComplete(newMarked, state.myLine)) {
            myBingo = true;
          }

          if (state.partnerLine && !partnerBingo && isLineComplete(newMarked, state.partnerLine)) {
            partnerBingo = true;
          }

          set({
            markedSquares: newMarked,
            myScore,
            partnerScore,
            myBingo,
            partnerBingo
          });
        },

        // Handle bingo event
        handleBingo: (player: 'me' | 'partner', myScore: number, partnerScore: number) => {
          if (player === 'me') {
            set({ myBingo: true, myScore, partnerScore });
          } else {
            set({ partnerBingo: true, myScore, partnerScore });
          }
        },

        // Handle daily reset
        handleDailyReset: () => {
          const state = get();
          const newSeed = getTodayDateString();

          set({
            myLine: null,
            partnerLine: null,
            partnerHasSelected: false,
            dailyCard: [],
            dailySeed: newSeed,
            markedSquares: Array(25).fill(false),
            myScore: 0,
            partnerScore: 0,
            myBingo: false,
            partnerBingo: false,
            phase: state.isPaired ? 'selecting' : 'unpaired'
          });
        },

        // Check if daily reset is needed
        checkDailyReset: () => {
          const state = get();
          if (!state.dailySeed) return false;

          if (hasNewDayStarted(state.dailySeed)) {
            get().handleDailyReset();
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
        }
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
          pairTimezone: state.pairTimezone,
          phase: state.phase,
          myLine: state.myLine,
          partnerLine: state.partnerLine,
          partnerHasSelected: state.partnerHasSelected,
          dailySeed: state.dailySeed,
          markedSquares: state.markedSquares,
          myScore: state.myScore,
          partnerScore: state.partnerScore,
          myBingo: state.myBingo,
          partnerBingo: state.partnerBingo
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
        }
      }
    )
  )
);

// Export utility for regenerating card on load
export function regenerateDailyCardIfNeeded(): void {
  const state = useDuoStore.getState();

  // Check for daily reset first
  if (state.dailySeed && hasNewDayStarted(state.dailySeed)) {
    useDuoStore.getState().handleDailyReset();
    return;
  }

  // Regenerate card from seed if in playing phase but card is empty
  if (state.phase === 'playing' && state.dailySeed && state.dailyCard.length === 0) {
    const card = generateDailyCard(state.dailySeed);
    useDuoStore.setState({ dailyCard: card });
  }

  // Reconnect WebSocket if we have session data
  if (state.pairCode && state.odId && state.phase !== 'unpaired') {
    useConnectionStore.getState().connect(state.pairCode, state.odId);
  }
}
