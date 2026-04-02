// LineSelector - Tap lines directly on the board
import { useState } from 'react';
import type { LineSelection } from '../../stores/duoStore';
import { getLineIndices } from '../../lib/dailyCard';

interface LineSelectorProps {
  onSelect: (line: LineSelection) => void;
  selectedLine?: LineSelection | null;
  isMyTurn: boolean;
  partnerHasSelected: boolean;
  disabled?: boolean;
}

const ALL_LINES: LineSelection[] = [
  { type: 'row', index: 0 }, { type: 'row', index: 1 },
  { type: 'row', index: 2 }, { type: 'row', index: 3 },
  { type: 'row', index: 4 },
  { type: 'col', index: 0 }, { type: 'col', index: 1 },
  { type: 'col', index: 2 }, { type: 'col', index: 3 },
  { type: 'col', index: 4 },
  { type: 'diag', index: 0 }, { type: 'diag', index: 1 }
];

function getLineName(line: LineSelection): string {
  switch (line.type) {
    case 'row': return `Row ${line.index + 1}`;
    case 'col': return `Col ${line.index + 1}`;
    case 'diag': return line.index === 0 ? 'Diag \u2198' : 'Diag \u2199';
  }
}

// Which lines pass through a given cell?
function getLinesForCell(cellIndex: number): LineSelection[] {
  return ALL_LINES.filter(line => getLineIndices(line).includes(cellIndex));
}

export function LineSelector({
  onSelect,
  selectedLine,
  isMyTurn,
  partnerHasSelected,
  disabled = false
}: LineSelectorProps) {
  const [hoveredLine, setHoveredLine] = useState<LineSelection | null>(null);
  const [tappedCell, setTappedCell] = useState<number | null>(null);

  const canPick = isMyTurn && !selectedLine;
  const highlightedIndices = hoveredLine ? getLineIndices(hoveredLine) : [];
  const selectedIndices = selectedLine ? getLineIndices(selectedLine) : [];

  const handleCellClick = (cellIndex: number) => {
    if (!canPick || disabled) return;

    const lines = getLinesForCell(cellIndex);

    if (lines.length === 1) {
      // Only one line passes through — select it directly
      onSelect(lines[0]);
      setTappedCell(null);
    } else {
      // Multiple lines — show picker for this cell
      setTappedCell(tappedCell === cellIndex ? null : cellIndex);
      setHoveredLine(null);
    }
  };

  const handleLineChoice = (line: LineSelection) => {
    if (!canPick || disabled) return;
    onSelect(line);
    setTappedCell(null);
  };

  const tappedLines = tappedCell !== null ? getLinesForCell(tappedCell) : [];
  const tappedHighlight = tappedCell !== null && tappedLines.length > 0 && !hoveredLine
    ? getLineIndices(tappedLines[0])
    : [];

  const getStatusMessage = () => {
    if (selectedLine) {
      if (partnerHasSelected) return null;
      return (
        <div className="text-center p-3 bg-j-accent/10 rounded-lg border border-j-accent/20">
          <p className="text-j-accent font-medium text-sm">
            You selected: {getLineName(selectedLine)}
          </p>
          <p className="text-j-tertiary text-xs font-mono mt-1">Waiting for partner...</p>
        </div>
      );
    }
    if (!isMyTurn) {
      return (
        <div className="text-center p-3 bg-j-accent/5 rounded-lg border border-j-accent/10">
          <p className="text-j-secondary text-sm font-mono">Waiting for partner to pick first...</p>
        </div>
      );
    }
    return (
      <div className="text-center p-3 bg-j-success/10 rounded-lg border border-j-success/20">
        <p className="text-j-success font-medium text-sm">Your turn to pick!</p>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-j-text mb-2 tracking-tight">Pick Your Line</h2>
        <p className="text-j-tertiary text-sm">
          {canPick
            ? 'Tap a square to select a row, column, or diagonal.'
            : 'Your opponent scores when they mark squares in YOUR line.'}
        </p>
      </div>

      {/* Interactive grid */}
      <div className="max-w-sm mx-auto">
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: 25 }, (_, i) => {
            const isSelected = selectedIndices.includes(i);
            const isHighlighted = highlightedIndices.includes(i);
            const isTappedHighlight = tappedHighlight.includes(i);
            const isTappedCell = tappedCell === i;

            return (
              <button
                key={i}
                onClick={() => handleCellClick(i)}
                onMouseEnter={() => {
                  if (!canPick || tappedCell !== null) return;
                  // On hover, highlight the row this cell is in
                  const row: LineSelection = { type: 'row', index: Math.floor(i / 5) };
                  setHoveredLine(row);
                }}
                onMouseLeave={() => setHoveredLine(null)}
                disabled={!canPick || disabled}
                className={`
                  aspect-square rounded-lg border-2 transition-all duration-150 relative
                  ${isSelected
                    ? 'bg-j-accent/30 border-j-accent'
                    : isHighlighted || isTappedHighlight
                    ? 'bg-j-accent/15 border-j-accent/50'
                    : isTappedCell
                    ? 'bg-j-accent/20 border-j-accent/60'
                    : 'bg-j-raised border-white/[0.06]'
                  }
                  ${canPick && !disabled ? 'cursor-pointer hover:border-j-accent/40' : 'cursor-not-allowed opacity-40'}
                `}
              >
                {isTappedCell && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-j-accent" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Line chooser popup — shows when tapped cell has multiple lines */}
      {tappedCell !== null && tappedLines.length > 1 && canPick && (
        <div className="flex flex-wrap justify-center gap-2 animate-fade-in">
          {tappedLines.map(line => (
            <button
              key={`${line.type}-${line.index}`}
              onClick={() => handleLineChoice(line)}
              onMouseEnter={() => setHoveredLine(line)}
              onMouseLeave={() => setHoveredLine(null)}
              className="px-4 py-2 rounded-lg text-xs font-mono bg-j-raised text-j-secondary hover:bg-j-accent/15 hover:text-j-accent transition-all border border-white/[0.06] hover:border-j-accent/30"
            >
              {getLineName(line)}
            </button>
          ))}
        </div>
      )}

      {getStatusMessage()}
    </div>
  );
}

export default LineSelector;
