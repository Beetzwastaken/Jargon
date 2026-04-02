import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { BingoSquare } from '../types';
import {
  generateDailyCard,
  generateRandomCard,
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
  bingoAwarded: boolean; // true once bingo bonus has been given this game
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
  bingoAwarded: false,
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

          // Daily reset: if seed is a date format and it's a new day, reset
          const isDateSeed = /^\d{4}-\d{2}-\d{2}$/.test(state.currentDateSeed);
          if (state.dailyCard.length > 0 && isDateSeed && hasNewDayStarted(state.currentDateSeed)) {
            const newCard = generateDailyCard(today);
            set({
              dailyCard: newCard,
              markedSquares: Array(25).fill(false),
              currentDateSeed: today,
              score: 0,
              hasBingo: false,
              bingoAwarded: false,
              winningLine: null,
              gamesPlayed: state.gamesPlayed + 1
            });
            return;
          }

          // Already have a card (including shuffled) — don't clobber
          if (state.dailyCard.length > 0) return;

          // First init
          const newCard = generateDailyCard(today);
          set({
            dailyCard: newCard,
            markedSquares: Array(25).fill(false),
            currentDateSeed: today,
            score: 0,
            hasBingo: false,
            bingoAwarded: false,
            winningLine: null,
            gamesPlayed: state.gamesPlayed || 1
          });
        },

        markSquare: (index: number) => {
          const state = get();
          if (index < 0 || index >= 25) return;

          const newMarked = [...state.markedSquares];
          newMarked[index] = !newMarked[index];

          // Check for any completed line
          let newBingo = false;
          let newWinningLine: WinningLine | null = null;
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
              break;
            }
          }

          // Bingo bonus awarded exactly once per game — persists even if line is broken
          const newBingoAwarded = state.bingoAwarded || newBingo;

          // Score = marked count + one-time bonus
          const markedCount = newMarked.filter(Boolean).length;
          const newScore = markedCount + (newBingoAwarded ? 5 : 0);

          // Total score delta
          const prevMarkedCount = state.markedSquares.filter(Boolean).length;
          const markDelta = markedCount - prevMarkedCount;
          const bonusDelta = (!state.bingoAwarded && newBingoAwarded) ? 5 : 0;

          set({
            markedSquares: newMarked,
            score: newScore,
            hasBingo: newBingo,
            bingoAwarded: newBingoAwarded,
            winningLine: newWinningLine,
            totalScore: Math.max(0, state.totalScore + markDelta + bonusDelta)
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
          const seed = Date.now() ^ (Math.random() * 0xFFFFFFFF);
          const newCard = generateRandomCard(seed);

          set({
            dailyCard: newCard,
            markedSquares: Array(25).fill(false),
            currentDateSeed: String(seed),
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
