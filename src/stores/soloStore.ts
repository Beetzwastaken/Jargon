import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { BingoSquare } from '../types';
import {
  generateDailyCard,
  getTodayDateString,
  hasNewDayStarted,
  isLineComplete
} from '../lib/dailyCard';

export type LineType = 'row' | 'col' | 'diag';

interface WinningLine {
  type: LineType;
  index: number;
}

interface SoloState {
  dailyCard: BingoSquare[];
  markedSquares: boolean[];
  currentDateSeed: string;
  score: number;
  hasBingo: boolean;
  winningLine: WinningLine | null;
  gamesPlayed: number;
  totalScore: number;
}

interface SoloActions {
  initializeCard: () => void;
  markSquare: (index: number) => void;
  resetForNewDay: () => void;
  shuffleNewCard: () => void;
}

type SoloStore = SoloState & SoloActions;

const initialState: SoloState = {
  dailyCard: [],
  markedSquares: Array(25).fill(false),
  currentDateSeed: '',
  score: 0,
  hasBingo: false,
  winningLine: null,
  gamesPlayed: 0,
  totalScore: 0
};

export const useSoloStore = create<SoloStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        initializeCard: () => {
          const state = get();
          const today = getTodayDateString();

          // Check if date changed
          if (state.currentDateSeed && hasNewDayStarted(state.currentDateSeed)) {
            // New day - reset marks, keep game counters
            const newCard = generateDailyCard(today);
            set({
              dailyCard: newCard,
              markedSquares: Array(25).fill(false),
              currentDateSeed: today,
              score: 0,
              hasBingo: false,
              winningLine: null,
              gamesPlayed: state.gamesPlayed + 1
            });
          } else if (!state.dailyCard.length) {
            // First init
            const newCard = generateDailyCard(today);
            set({
              dailyCard: newCard,
              markedSquares: Array(25).fill(false),
              currentDateSeed: today,
              score: 0,
              hasBingo: false,
              winningLine: null,
              gamesPlayed: state.gamesPlayed || 1
            });
          }
        },

        markSquare: (index: number) => {
          const state = get();

          if (index < 0 || index >= 25) return;
          const newMarked = [...state.markedSquares];
          newMarked[index] = !newMarked[index];

          // +1 for marking, -1 for unmarking (floor at 0)
          let newScore = Math.max(0, state.score + (newMarked[index] ? 1 : -1));
          let newBingo = false;
          let newWinningLine: WinningLine | null = null;
          const hadBingo = state.hasBingo;

          // Check all 12 possible lines
          const linesToCheck: WinningLine[] = [
            { type: 'row', index: 0 }, { type: 'row', index: 1 },
            { type: 'row', index: 2 }, { type: 'row', index: 3 },
            { type: 'row', index: 4 },
            { type: 'col', index: 0 }, { type: 'col', index: 1 },
            { type: 'col', index: 2 }, { type: 'col', index: 3 },
            { type: 'col', index: 4 },
            { type: 'diag', index: 0 }, { type: 'diag', index: 1 }
          ];

          for (const line of linesToCheck) {
            if (isLineComplete(newMarked, line)) {
              newBingo = true;
              newWinningLine = line;
              if (!hadBingo) newScore += 5; // Bonus only on first bingo
              break;
            }
          }

          // Score delta for totalScore: +1 mark, -1 unmark, +6 first bingo
          const delta = newMarked[index] ? 1 : -1;
          const bingoBonus = (newBingo && !hadBingo) ? 5 : 0;

          set({
            markedSquares: newMarked,
            score: newScore,
            hasBingo: newBingo,
            winningLine: newWinningLine,
            totalScore: Math.max(0, state.totalScore + delta + bingoBonus)
          });
        },

        resetForNewDay: () => {
          const state = get();
          const today = getTodayDateString();
          const newCard = generateDailyCard(today);

          set({
            dailyCard: newCard,
            markedSquares: Array(25).fill(false),
            currentDateSeed: today,
            score: 0,
            hasBingo: false,
            winningLine: null,
            gamesPlayed: state.gamesPlayed + 1
          });
        },

        shuffleNewCard: () => {
          const state = get();
          const seed = `${Date.now()}-${Math.random()}`;
          const newCard = generateDailyCard(seed);

          set({
            dailyCard: newCard,
            markedSquares: Array(25).fill(false),
            currentDateSeed: seed,
            score: 0,
            hasBingo: false,
            winningLine: null,
            gamesPlayed: state.gamesPlayed + 1
          });
        }
      }),
      {
        name: 'jargon-solo'
      }
    )
  )
);
