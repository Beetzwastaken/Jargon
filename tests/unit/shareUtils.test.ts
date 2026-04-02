import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateEmojiGrid, copyToClipboard, generateShareText } from '../../src/utils/shareUtils';

describe('shareUtils', () => {
  describe('generateEmojiGrid', () => {
    it('should generate correct emoji grid for a winning board', () => {
      const options = {
        board: Array(25).fill({ text: 'test' }),
        markedSquares: [
          true, true, true, true, true,  // Row 1 (winning)
          false, false, false, false, false,
          false, false, false, false, false,
          false, false, false, false, false,
          false, false, false, false, false
        ],
        winningCells: [0, 1, 2, 3, 4],  // Top row wins
        score: 100,
        gamesPlayed: 5
      };

      const result = generateEmojiGrid(options);

      // Check header
      expect(result).toContain('🎯 Jargon #5');
      expect(result).toContain('BINGO! 5/25 squares');
      expect(result).toContain('Score: 100 points');

      // Check winning squares show as yellow (🟨)
      expect(result).toContain('🟨🟨🟨🟨🟨');

      // Check footer
      expect(result).toContain('Play at: https://playjargon.com');
    });

    it('should differentiate between marked and winning squares', () => {
      const options = {
        board: Array(25).fill({ text: 'test' }),
        markedSquares: [
          true, true, false, false, false,
          true, true, false, false, false,
          true, true, false, false, false,
          true, true, false, false, false,
          true, true, false, false, false
        ],
        winningCells: [0, 5, 10, 15, 20],  // Left column wins
        score: 150,
        gamesPlayed: 1
      };

      const result = generateEmojiGrid(options);

      // First two rows should have: winning (🟨), marked (🟩), unmarked (⬜)
      const lines = result.split('\n');
      const gridStart = lines.findIndex(line => line.includes('🟨') || line.includes('🟩') || line.includes('⬜'));

      expect(gridStart).toBeGreaterThan(-1);
      expect(lines[gridStart]).toContain('🟨');  // Winning square
      expect(lines[gridStart]).toContain('🟩');  // Marked but not winning
      expect(lines[gridStart]).toContain('⬜');  // Unmarked
    });

    it('should handle empty board correctly', () => {
      const options = {
        board: Array(25).fill({ text: 'test' }),
        markedSquares: Array(25).fill(false),
        winningCells: [],
        score: 0,
        gamesPlayed: 1
      };

      const result = generateEmojiGrid(options);

      // Should show all unmarked squares
      expect(result).toContain('⬜⬜⬜⬜⬜');
      expect(result).toContain('BINGO! 0/25 squares');
      expect(result).toContain('Score: 0 points');
    });

    it('should count marked squares correctly', () => {
      const options = {
        board: Array(25).fill({ text: 'test' }),
        markedSquares: [
          true, true, true, false, false,
          false, false, false, false, false,
          false, false, false, false, false,
          false, false, false, false, false,
          false, false, false, false, false
        ],
        winningCells: [],
        score: 30,
        gamesPlayed: 1
      };

      const result = generateEmojiGrid(options);

      expect(result).toContain('BINGO! 3/25 squares');
    });

    it('should generate correct grid dimensions (5x5)', () => {
      const options = {
        board: Array(25).fill({ text: 'test' }),
        markedSquares: Array(25).fill(true),
        winningCells: [],
        score: 250,
        gamesPlayed: 10
      };

      const result = generateEmojiGrid(options);
      const lines = result.split('\n');
      const gridLines = lines.filter(line =>
        line.includes('🟩') || line.includes('🟨') || line.includes('⬜')
      );

      // Should have exactly 5 rows
      expect(gridLines).toHaveLength(5);

      // Each row should have 5 emojis
      gridLines.forEach(line => {
        const emojiCount = (line.match(/🟩|🟨|⬜/g) || []).length;
        expect(emojiCount).toBe(5);
      });
    });
  });

  describe('copyToClipboard', () => {
    beforeEach(() => {
      // Mock clipboard API
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockResolvedValue(undefined)
        }
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should successfully copy text using modern clipboard API', async () => {
      const testText = 'Test clipboard content';
      const result = await copyToClipboard(testText);

      expect(result).toBe(true);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(testText);
    });

    it('should handle clipboard API failure gracefully', async () => {
      // Mock clipboard API to fail
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockRejectedValue(new Error('Clipboard denied'))
        }
      });

      // Mock document.execCommand fallback
      document.execCommand = vi.fn().mockReturnValue(true);

      const testText = 'Test clipboard content';
      const result = await copyToClipboard(testText);

      // Should attempt to use navigator.clipboard first
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(testText);
    });

    it('should use fallback when clipboard API is not available', async () => {
      // Remove clipboard API
      const originalClipboard = navigator.clipboard;
      // @ts-expect-error - Testing fallback behavior
      delete navigator.clipboard;

      // Mock document.execCommand
      document.execCommand = vi.fn().mockReturnValue(true);
      document.body.appendChild = vi.fn();
      document.body.removeChild = vi.fn();

      const testText = 'Test clipboard content';
      await copyToClipboard(testText);

      expect(document.execCommand).toHaveBeenCalledWith('copy');

      // Restore
      Object.assign(navigator, { clipboard: originalClipboard });
    });
  });

  describe('generateShareText', () => {
    it('should generate correct share text with score and marked count', () => {
      const options = {
        board: Array(25).fill({ text: 'test' }),
        markedSquares: Array(25).fill(true).map((_, i) => i < 15),  // 15 marked
        score: 200
      };

      const result = generateShareText(options);

      expect(result).toContain('🎯 I got BINGO in Jargon!');
      expect(result).toContain('15/25 squares');
      expect(result).toContain('200 points');
      expect(result).toContain('Play at: https://playjargon.com');
    });

    it('should handle zero score and squares', () => {
      const options = {
        board: Array(25).fill({ text: 'test' }),
        markedSquares: Array(25).fill(false),
        score: 0
      };

      const result = generateShareText(options);

      expect(result).toContain('0/25 squares');
      expect(result).toContain('0 points');
    });

    it('should include encouraging message', () => {
      const options = {
        board: Array(25).fill({ text: 'test' }),
        markedSquares: Array(25).fill(true).map((_, i) => i < 20),
        score: 300
      };

      const result = generateShareText(options);

      expect(result).toContain('Survived another meeting full of buzzwords');
      expect(result).toContain('😅');
    });
  });
});
