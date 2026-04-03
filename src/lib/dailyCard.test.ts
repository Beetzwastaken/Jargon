import { describe, it, expect } from 'vitest';
import { countCompletedLines, getCompletedLineIndices } from './dailyCard';

describe('countCompletedLines', () => {
  it('returns 0 for empty marks', () => {
    expect(countCompletedLines([])).toBe(0);
  });

  it('returns 0 for partial line (4 of 5)', () => {
    expect(countCompletedLines([0, 1, 2, 3])).toBe(0);
  });

  it('returns 1 for completed row 0', () => {
    expect(countCompletedLines([0, 1, 2, 3, 4])).toBe(1);
  });

  it('returns 1 for completed col 0', () => {
    expect(countCompletedLines([0, 5, 10, 15, 20])).toBe(1);
  });

  it('returns 1 for completed diagonal 0', () => {
    expect(countCompletedLines([0, 6, 12, 18, 24])).toBe(1);
  });

  it('returns 1 for completed diagonal 1', () => {
    expect(countCompletedLines([4, 8, 12, 16, 20])).toBe(1);
  });

  it('returns 2 for row + col sharing a corner', () => {
    expect(countCompletedLines([0, 1, 2, 3, 4, 5, 10, 15, 20])).toBe(2);
  });

  it('returns 12 for all 25 squares marked', () => {
    const all = Array.from({ length: 25 }, (_, i) => i);
    expect(countCompletedLines(all)).toBe(12);
  });

  it('handles duplicate indices', () => {
    expect(countCompletedLines([0, 1, 2, 3, 4, 4, 4])).toBe(1);
  });
});

describe('getCompletedLineIndices', () => {
  it('returns empty for no completed lines', () => {
    expect(getCompletedLineIndices([])).toEqual([]);
  });

  it('returns row 0 indices when row 0 is complete', () => {
    const result = getCompletedLineIndices([0, 1, 2, 3, 4]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual([0, 1, 2, 3, 4]);
  });

  it('returns diagonal indices when diagonal is complete', () => {
    const result = getCompletedLineIndices([0, 6, 12, 18, 24]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual([0, 6, 12, 18, 24]);
  });

  it('returns multiple arrays for multiple completed lines', () => {
    const result = getCompletedLineIndices([0, 1, 2, 3, 4, 5, 10, 15, 20]);
    expect(result).toHaveLength(2);
    const flat = result.flat();
    expect(flat).toContain(0);
    expect(flat).toContain(4);
    expect(flat).toContain(20);
  });
});
