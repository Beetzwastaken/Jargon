// Bingo game engine for Jargon
// Simplified scoring: +1 per square, +5 BINGO bonus only (no 3/4-in-row)
import { JARGON_PHRASES } from '../data/buzzwords';

export interface BingoSquare {
  id: string;
  text: string;
  isMarked: boolean;
}

export interface BingoResult {
  hasWon: boolean;
  winningPattern?: 'row' | 'column' | 'diagonal';
  winningCells?: number[];
}

export interface LineBonus {
  type: 'bingo';
  points: number;
  pattern: 'row' | 'column' | 'diagonal';
  lineIndex: number;
  cells: number[];
}

export interface BingoAnalysis {
  bingoResult: BingoResult;
  lineBonuses: LineBonus[];
  totalBonusPoints: number;
}

export class BingoEngine {
  /**
   * Generate a new bingo card with random buzzwords
   */
  static generateCard(): BingoSquare[] {
    const shuffled = [...JARGON_PHRASES].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 25); // 25 buzzwords, no free space

    const card: BingoSquare[] = [];

    for (let i = 0; i < 25; i++) {
      card.push({
        id: `square-${i}`,
        text: selected[i],
        isMarked: false
      });
    }
    return card;
  }

  /**
   * Check if the current card has a bingo
   */
  static checkBingo(squares: BingoSquare[]): BingoResult {
    // Guard: empty board can't have BINGO
    if (squares.length !== 25) {
      return { hasWon: false };
    }

    // Check rows
    for (let row = 0; row < 5; row++) {
      const rowStart = row * 5;
      const rowSquares = squares.slice(rowStart, rowStart + 5);
      if (rowSquares.every(square => square.isMarked)) {
        return {
          hasWon: true,
          winningPattern: 'row',
          winningCells: Array.from({ length: 5 }, (_, i) => rowStart + i)
        };
      }
    }

    // Check columns
    for (let col = 0; col < 5; col++) {
      const colSquares = squares.filter((_, index) => index % 5 === col);
      if (colSquares.every(square => square.isMarked)) {
        return {
          hasWon: true,
          winningPattern: 'column',
          winningCells: Array.from({ length: 5 }, (_, i) => i * 5 + col)
        };
      }
    }

    // Check diagonals
    const diagonal1Indices = [0, 6, 12, 18, 24];
    const diagonal2Indices = [4, 8, 12, 16, 20];

    const diagonal1 = diagonal1Indices.map(i => squares[i]);
    const diagonal2 = diagonal2Indices.map(i => squares[i]);

    if (diagonal1.every(square => square.isMarked)) {
      return {
        hasWon: true,
        winningPattern: 'diagonal',
        winningCells: diagonal1Indices
      };
    }

    if (diagonal2.every(square => square.isMarked)) {
      return {
        hasWon: true,
        winningPattern: 'diagonal',
        winningCells: diagonal2Indices
      };
    }

    return { hasWon: false };
  }

  /**
   * Analyze board for BINGO bonuses only (simplified scoring)
   * Only awards +5 bonus for complete 5-in-a-row lines
   */
  static analyzeBoardForBonuses(squares: BingoSquare[]): BingoAnalysis {
    // Guard: incomplete board has no bonuses
    if (squares.length !== 25) {
      return { bingoResult: { hasWon: false }, lineBonuses: [], totalBonusPoints: 0 };
    }

    const lineBonuses: LineBonus[] = [];

    // Check rows for BINGO
    for (let row = 0; row < 5; row++) {
      const rowStart = row * 5;
      const rowSquares = squares.slice(rowStart, rowStart + 5);
      const cellIndices = Array.from({ length: 5 }, (_, i) => rowStart + i);

      if (rowSquares.every(s => s.isMarked)) {
        lineBonuses.push({
          type: 'bingo',
          points: 5,
          pattern: 'row',
          lineIndex: row,
          cells: cellIndices
        });
      }
    }

    // Check columns for BINGO
    for (let col = 0; col < 5; col++) {
      const colSquares = squares.filter((_, index) => index % 5 === col);
      const cellIndices = Array.from({ length: 5 }, (_, i) => i * 5 + col);

      if (colSquares.every(s => s.isMarked)) {
        lineBonuses.push({
          type: 'bingo',
          points: 5,
          pattern: 'column',
          lineIndex: col,
          cells: cellIndices
        });
      }
    }

    // Check diagonals for BINGO
    const diagonal1Indices = [0, 6, 12, 18, 24];
    const diagonal2Indices = [4, 8, 12, 16, 20];

    const diagonal1Squares = diagonal1Indices.map(i => squares[i]);
    if (diagonal1Squares.every(s => s.isMarked)) {
      lineBonuses.push({
        type: 'bingo',
        points: 5,
        pattern: 'diagonal',
        lineIndex: 0,
        cells: diagonal1Indices
      });
    }

    const diagonal2Squares = diagonal2Indices.map(i => squares[i]);
    if (diagonal2Squares.every(s => s.isMarked)) {
      lineBonuses.push({
        type: 'bingo',
        points: 5,
        pattern: 'diagonal',
        lineIndex: 1,
        cells: diagonal2Indices
      });
    }

    // Calculate total bonus points
    const totalBonusPoints = lineBonuses.reduce((sum, bonus) => sum + bonus.points, 0);

    // Get standard BINGO result
    const bingoResult = this.checkBingo(squares);

    return {
      bingoResult,
      lineBonuses,
      totalBonusPoints
    };
  }

  /**
   * Calculate completion percentage of the card
   */
  static getCompletionPercentage(squares: BingoSquare[]): number {
    const markedCount = squares.filter(square => square.isMarked).length;
    return (markedCount / squares.length) * 100;
  }

  /**
   * Get statistics about marked squares
   */
  static getSquareStats(squares: BingoSquare[]) {
    const marked = squares.filter(s => s.isMarked);
    const total = squares.length;

    return {
      marked: marked.length,
      total,
      percentage: (marked.length / total) * 100,
      remaining: total - marked.length
    };
  }

  /**
   * Suggest squares that are commonly marked together
   */
  static getSuggestedSquares(squares: BingoSquare[]): string[] {
    const markedTexts = squares
      .filter(s => s.isMarked)
      .map(s => s.text);

    // Common combinations in corporate meetings
    const combinations = [
      ['Synergy', 'Paradigm Shift', 'Game Changer'],
      ['Deep Dive', 'Circle Back', 'Touch Base'],
      ['AI/ML Integration', 'Digital Transformation', 'Cloud Migration'],
      ['Agile Transformation', 'Sprint Planning', 'Stand-up'],
      ['Low-hanging Fruit', 'Move the Needle', 'Think Outside the Box']
    ];

    const suggestions: string[] = [];

    for (const combo of combinations) {
      const markedInCombo = combo.filter(term => markedTexts.includes(term));
      if (markedInCombo.length > 0) {
        const unmarked = combo.filter(term =>
          !markedTexts.includes(term) &&
          squares.some(s => s.text === term && !s.isMarked)
        );
        suggestions.push(...unmarked);
      }
    }

    return [...new Set(suggestions)].slice(0, 3); // Return unique suggestions
  }
}
