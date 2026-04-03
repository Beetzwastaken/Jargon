// Daily Card Generation - Deterministic seeded shuffle for global daily cards
// Same date = same card for everyone worldwide

import { JARGON_PHRASES as buzzwords } from '../data/buzzwords';
import type { BingoSquare } from '../types';

/**
 * Mulberry32 - Fast seeded PRNG
 * Same seed always produces same sequence
 */
function mulberry32(seed: number): () => number {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Convert YYYY-MM-DD string to numeric seed
 * Deterministic: same date always = same seed
 */
function dateToSeed(dateString: string): number {
  // Parse YYYY-MM-DD
  const [year, month, day] = dateString.split('-').map(Number);

  // Create unique seed from date components
  // Using prime multipliers to reduce collisions
  return (year * 10000) + (month * 100) + day;
}

/**
 * Fisher-Yates shuffle with seeded RNG
 */
function seededShuffle<T>(array: T[], rng: () => number): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Generate daily bingo card from date
 * Same date = same 25 phrases in same positions globally
 *
 * @param dateString - YYYY-MM-DD format
 * @returns Array of 25 BingoSquares
 */
export function generateDailyCard(dateString: string): BingoSquare[] {
  const seed = dateToSeed(dateString);
  const rng = mulberry32(seed);

  // Shuffle all buzzwords with seeded RNG
  const shuffled = seededShuffle([...buzzwords], rng);

  // Take first 25 for the card
  return shuffled.slice(0, 25).map((text: string, index: number) => ({
    id: `square-${index}`,
    text,
    isMarked: false
  }));
}

/**
 * Generate a random card from a numeric seed (not date-based)
 */
export function generateRandomCard(numericSeed: number): BingoSquare[] {
  const rng = mulberry32(numericSeed);
  const shuffled = seededShuffle([...buzzwords], rng);
  return shuffled.slice(0, 25).map((text: string, index: number) => ({
    id: `square-${index}`,
    text,
    isMarked: false
  }));
}

/**
 * Get today's date string in UTC
 * @returns YYYY-MM-DD string for current UTC date
 */
export function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Check if we've crossed UTC midnight since a reference time
 * @param lastSeed - Previous day's seed string (YYYY-MM-DD)
 * @returns true if current UTC date differs from lastSeed
 */
export function hasNewDayStarted(lastSeed: string): boolean {
  const currentDate = getTodayDateString();
  return currentDate !== lastSeed;
}

/**
 * Get indices for a line selection
 *
 * Grid layout (0-24):
 *  0  1  2  3  4
 *  5  6  7  8  9
 * 10 11 12 13 14
 * 15 16 17 18 19
 * 20 21 22 23 24
 */
export function getLineIndices(line: { type: 'row' | 'col' | 'diag'; index: number }): number[] {
  switch (line.type) {
    case 'row': {
      // Row N = indices [N*5, N*5+1, N*5+2, N*5+3, N*5+4]
      const rowStart = line.index * 5;
      return [rowStart, rowStart + 1, rowStart + 2, rowStart + 3, rowStart + 4];
    }

    case 'col':
      // Col N = indices [N, N+5, N+10, N+15, N+20]
      return [line.index, line.index + 5, line.index + 10, line.index + 15, line.index + 20];

    case 'diag':
      if (line.index === 0) {
        // Top-left to bottom-right: [0, 6, 12, 18, 24]
        return [0, 6, 12, 18, 24];
      } else {
        // Top-right to bottom-left: [4, 8, 12, 16, 20]
        return [4, 8, 12, 16, 20];
      }

    default:
      return [];
  }
}

/**
 * Check if a square index is in a given line
 */
export function isSquareInLine(squareIndex: number, line: { type: 'row' | 'col' | 'diag'; index: number }): boolean {
  return getLineIndices(line).includes(squareIndex);
}

/** All 12 possible bingo lines on a 5x5 grid */
export const ALL_LINES: Array<{ type: 'row' | 'col' | 'diag'; index: number }> = [
  { type: 'row', index: 0 }, { type: 'row', index: 1 }, { type: 'row', index: 2 },
  { type: 'row', index: 3 }, { type: 'row', index: 4 },
  { type: 'col', index: 0 }, { type: 'col', index: 1 }, { type: 'col', index: 2 },
  { type: 'col', index: 3 }, { type: 'col', index: 4 },
  { type: 'diag', index: 0 }, { type: 'diag', index: 1 }
];

/** Count how many bingo lines are fully completed (all 5 squares marked by anyone) */
export function countCompletedLines(markedIndices: number[]): number {
  const markedSet = new Set(markedIndices);
  let count = 0;
  for (const line of ALL_LINES) {
    const indices = getLineIndices(line);
    if (indices.every(idx => markedSet.has(idx))) {
      count++;
    }
  }
  return count;
}

/** Get indices of all completed bingo lines (for highlighting) */
export function getCompletedLineIndices(markedIndices: number[]): number[][] {
  const markedSet = new Set(markedIndices);
  const completed: number[][] = [];
  for (const line of ALL_LINES) {
    const indices = getLineIndices(line);
    if (indices.every(idx => markedSet.has(idx))) {
      completed.push(indices);
    }
  }
  return completed;
}

/**
 * Count how many squares in a line are marked
 */
export function countMarkedInLine(
  markedSquares: boolean[],
  line: { type: 'row' | 'col' | 'diag'; index: number }
): number {
  const indices = getLineIndices(line);
  return indices.filter(i => markedSquares[i]).length;
}

/**
 * Check if a line is complete (all 5 squares marked)
 */
export function isLineComplete(
  markedSquares: boolean[],
  line: { type: 'row' | 'col' | 'diag'; index: number }
): boolean {
  return countMarkedInLine(markedSquares, line) === 5;
}
