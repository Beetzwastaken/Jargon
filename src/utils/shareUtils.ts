// Utility functions for generating shareable content

interface BoardSquare {
  text: string;
  isMarked?: boolean;
}

interface ShareOptions {
  board: BoardSquare[];
  markedSquares: boolean[];
  winningCells?: number[];
  score?: number;
  gamesPlayed?: number;
}

/**
 * Generate emoji grid for sharing (like Wordle)
 * 🟩 = Marked square
 * ⬜ = Unmarked square
 * 🟨 = Winning line square
 */
export function generateEmojiGrid(options: ShareOptions): string {
  const { markedSquares, winningCells = [], score = 0, gamesPlayed = 1 } = options;

  // Count marked squares
  const markedCount = markedSquares.filter(Boolean).length;

  // Generate header
  const header = `🎯 Jargon #${gamesPlayed}\nBINGO! ${markedCount}/25 squares\nScore: ${score} points\n\n`;

  // Generate grid (5x5)
  let grid = '';
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const index = row * 5 + col;
      const isWinning = winningCells.includes(index);
      const isMarked = markedSquares[index];

      if (isWinning) {
        grid += '🟨'; // Winning square (yellow)
      } else if (isMarked) {
        grid += '🟩'; // Marked square (green)
      } else {
        grid += '⬜'; // Unmarked square (white)
      }
    }
    grid += '\n';
  }

  // Add footer
  const footer = '\nPlay at: https://playjargon.com';

  return header + grid + footer;
}

/**
 * Copy text to clipboard with fallback
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    // Modern clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();

    try {
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    } catch {
      document.body.removeChild(textArea);
      return false;
    }
  } catch {
    return false;
  }
}

/**
 * Generate shareable text for social media
 */
export function generateShareText(options: ShareOptions): string {
  const { score = 0 } = options;
  const markedCount = options.markedSquares.filter(Boolean).length;

  return `🎯 I got BINGO in Jargon! ${markedCount}/25 squares, ${score} points!\n\nSurvived another meeting full of buzzwords 😅\n\nPlay at: https://playjargon.com`;
}
