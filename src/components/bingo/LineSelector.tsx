// LineSelector - Visual grid for selecting bingo line
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

// All 12 possible lines
const ALL_LINES: LineSelection[] = [
  { type: 'row', index: 0 },
  { type: 'row', index: 1 },
  { type: 'row', index: 2 },
  { type: 'row', index: 3 },
  { type: 'row', index: 4 },
  { type: 'col', index: 0 },
  { type: 'col', index: 1 },
  { type: 'col', index: 2 },
  { type: 'col', index: 3 },
  { type: 'col', index: 4 },
  { type: 'diag', index: 0 },
  { type: 'diag', index: 1 }
];

function lineEquals(a: LineSelection | null | undefined, b: LineSelection | null | undefined): boolean {
  if (!a || !b) return false;
  return a.type === b.type && a.index === b.index;
}

function getLineName(line: LineSelection): string {
  switch (line.type) {
    case 'row':
      return `Row ${line.index + 1}`;
    case 'col':
      return `Column ${line.index + 1}`;
    case 'diag':
      return line.index === 0 ? 'Diagonal ↘' : 'Diagonal ↙';
  }
}

export function LineSelector({
  onSelect,
  selectedLine,
  isMyTurn,
  partnerHasSelected,
  disabled = false
}: LineSelectorProps) {
  const [hoveredLine, setHoveredLine] = useState<LineSelection | null>(null);

  const canPick = isMyTurn && !selectedLine;

  // Get indices that should be highlighted
  const highlightedIndices = hoveredLine ? getLineIndices(hoveredLine) : [];
  const selectedIndices = selectedLine ? getLineIndices(selectedLine) : [];

  const handleLineClick = (line: LineSelection) => {
    if (!canPick || disabled) return;
    if (lineEquals(line, selectedLine)) return;
    onSelect(line);
  };

  // Render a single cell
  const renderCell = (index: number) => {
    const isHighlighted = highlightedIndices.includes(index);
    const isSelected = selectedIndices.includes(index);

    return (
      <div
        key={index}
        className={`
          aspect-square rounded-lg border-2 transition-all duration-150
          ${isSelected
            ? 'bg-cyan-500/30 border-cyan-500'
            : isHighlighted
            ? 'bg-cyan-500/20 border-cyan-500/50'
            : 'bg-apple-darkest border-apple-border'
          }
        `}
      />
    );
  };

  // Render line selector button
  const renderLineButton = (line: LineSelection) => {
    const isSelected = lineEquals(line, selectedLine);
    const isHovered = lineEquals(line, hoveredLine);

    return (
      <button
        key={`${line.type}-${line.index}`}
        onClick={() => handleLineClick(line)}
        onMouseEnter={() => canPick ? setHoveredLine(line) : null}
        onMouseLeave={() => setHoveredLine(null)}
        disabled={!canPick || disabled}
        className={`
          px-3 py-2 rounded-lg text-sm font-medium transition-all
          ${isSelected
            ? 'bg-cyan-500 text-white'
            : isHovered
            ? 'bg-cyan-500/20 text-cyan-400'
            : 'bg-apple-darkest text-apple-secondary hover:bg-apple-hover hover:text-apple-text'
          }
          ${(!canPick || disabled) ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        {getLineName(line)}
      </button>
    );
  };

  // Status message
  const getStatusMessage = () => {
    if (selectedLine) {
      if (partnerHasSelected) {
        return null; // Both selected, transitioning
      }
      return (
        <div className="text-center p-4 bg-cyan-500/10 rounded-lg border border-cyan-500/30">
          <p className="text-cyan-400 font-medium">
            You selected: {getLineName(selectedLine)}
          </p>
          <p className="text-apple-secondary text-sm mt-1">
            Waiting for partner...
          </p>
        </div>
      );
    }

    if (!isMyTurn) {
      return (
        <div className="text-center p-4 bg-amber-500/10 rounded-lg border border-amber-500/30">
          <p className="text-amber-400 text-sm">
            Waiting for partner to pick first...
          </p>
        </div>
      );
    }

    return (
      <div className="text-center p-4 bg-green-500/10 rounded-lg border border-green-500/30">
        <p className="text-green-400 font-medium">
          Your turn to pick!
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <div className="text-center">
        <h2 className="text-xl font-semibold text-apple-text mb-2">
          Pick Your Line
        </h2>
        <p className="text-apple-secondary text-sm">
          Choose a row, column, or diagonal. Your opponent scores when they mark squares in YOUR line.
        </p>
      </div>

      {/* Visual Grid Preview */}
      <div className="max-w-xs mx-auto">
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: 25 }, (_, i) => renderCell(i))}
        </div>
      </div>

      {/* Line Selection Buttons */}
      <div className="space-y-4">
        <div>
          <h3 className="text-xs font-medium text-apple-secondary uppercase tracking-wider mb-2">
            Rows
          </h3>
          <div className="flex flex-wrap gap-2">
            {ALL_LINES.filter(l => l.type === 'row').map(renderLineButton)}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-medium text-apple-secondary uppercase tracking-wider mb-2">
            Columns
          </h3>
          <div className="flex flex-wrap gap-2">
            {ALL_LINES.filter(l => l.type === 'col').map(renderLineButton)}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-medium text-apple-secondary uppercase tracking-wider mb-2">
            Diagonals
          </h3>
          <div className="flex flex-wrap gap-2">
            {ALL_LINES.filter(l => l.type === 'diag').map(renderLineButton)}
          </div>
        </div>
      </div>

      {/* Status */}
      {getStatusMessage()}
    </div>
  );
}

export default LineSelector;
