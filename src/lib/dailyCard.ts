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
 * Get today's date string in a specific timezone
 *
 * @param timezone - IANA timezone string (e.g., "America/New_York")
 * @returns YYYY-MM-DD string for current date in that timezone
 */
export function getTodayDateString(timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    // en-CA locale gives us YYYY-MM-DD format
    return formatter.format(now);
  } catch {
    // Fallback to UTC if timezone is invalid
    const now = new Date();
    return now.toISOString().split('T')[0];
  }
}

/**
 * Get user's local timezone
 * @returns IANA timezone string
 */
export function getLocalTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Check if we've crossed midnight in a timezone since a reference time
 * Used to detect when daily reset should occur
 *
 * @param timezone - IANA timezone string
 * @param lastSeed - Previous day's seed string (YYYY-MM-DD)
 * @returns true if current date in timezone differs from lastSeed
 */
export function hasNewDayStarted(timezone: string, lastSeed: string): boolean {
  const currentDate = getTodayDateString(timezone);
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
