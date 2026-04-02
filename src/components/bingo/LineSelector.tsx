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
      return line.index === 0 ? 'Diagonal \u2198' : 'Diagonal \u2199';
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

  const highlightedIndices = hoveredLine ? getLineIndices(hoveredLine) : [];
  const selectedIndices = selectedLine ? getLineIndices(selectedLine) : [];

  const handleLineClick = (line: LineSelection) => {
    if (!canPick || disabled) return;
    if (lineEquals(line, selectedLine)) return;
    onSelect(line);
  };

  const renderCell = (index: number) => {
    const isHighlighted = highlightedIndices.includes(index);
    const isSelected = selectedIndices.includes(index);

    return (
      <div
        key={index}
        className={`
          aspect-square rounded border transition-all duration-150
          ${isSelected
            ? 'bg-j-accent/30 border-j-accent/60'
            : isHighlighted
            ? 'bg-j-accent/15 border-j-accent/40'
            : 'bg-j-raised border-white/[0.06]'
          }
        `}
      />
    );
  };

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
          px-3 py-2 rounded-lg text-xs font-mono transition-all
          ${isSelected
            ? 'bg-j-accent text-j-bg font-bold'
            : isHovered
            ? 'bg-j-accent/15 text-j-accent'
            : 'bg-j-raised text-j-secondary hover:bg-j-hover hover:text-j-text'
          }
          ${(!canPick || disabled) ? 'opacity-40 cursor-not-allowed' : ''}
        `}
      >
        {getLineName(line)}
      </button>
    );
  };

  const getStatusMessage = () => {
    if (selectedLine) {
      if (partnerHasSelected) return null;
      return (
        <div className="text-center p-4 bg-j-accent/10 rounded-lg border border-j-accent/20">
          <p className="text-j-accent font-medium text-sm">
            You selected: {getLineName(selectedLine)}
          </p>
          <p className="text-j-tertiary text-xs font-mono mt-1">
            Waiting for partner...
          </p>
        </div>
      );
    }

    if (!isMyTurn) {
      return (
        <div className="text-center p-4 bg-j-accent/5 rounded-lg border border-j-accent/10">
          <p className="text-j-secondary text-sm font-mono">
            Waiting for partner to pick first...
          </p>
        </div>
      );
    }

    return (
      <div className="text-center p-4 bg-j-success/10 rounded-lg border border-j-success/20">
        <p className="text-j-success font-medium text-sm">
          Your turn to pick!
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-j-text mb-2 tracking-tight">
          Pick Your Line
        </h2>
        <p className="text-j-tertiary text-sm">
          Choose a row, column, or diagonal. Your opponent scores when they mark squares in YOUR line.
        </p>
      </div>

      <div className="max-w-xs mx-auto">
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: 25 }, (_, i) => renderCell(i))}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-[10px] font-mono text-j-muted uppercase tracking-wider mb-2">Rows</h3>
          <div className="flex flex-wrap gap-2">
            {ALL_LINES.filter(l => l.type === 'row').map(renderLineButton)}
          </div>
        </div>

        <div>
          <h3 className="text-[10px] font-mono text-j-muted uppercase tracking-wider mb-2">Columns</h3>
          <div className="flex flex-wrap gap-2">
            {ALL_LINES.filter(l => l.type === 'col').map(renderLineButton)}
          </div>
        </div>

        <div>
          <h3 className="text-[10px] font-mono text-j-muted uppercase tracking-wider mb-2">Diagonals</h3>
          <div className="flex flex-wrap gap-2">
            {ALL_LINES.filter(l => l.type === 'diag').map(renderLineButton)}
          </div>
        </div>
      </div>

      {getStatusMessage()}
    </div>
  );
}

export default LineSelector;
