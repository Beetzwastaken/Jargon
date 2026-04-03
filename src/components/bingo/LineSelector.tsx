// LineSelector - Two-tap line selection on the board
import { useState, useCallback } from 'react';
import type { LineSelection } from '../../stores/duoStore';
import { getLineIndices } from '../../lib/dailyCard';

interface LineSelectorProps {
  onSelect: (line: LineSelection) => void;
  selectedLine?: LineSelection | null;
  isMyTurn: boolean;
  partnerHasSelected: boolean;
  disabled?: boolean;
}

const DIAG_DOWN = [0, 6, 12, 18, 24];
const DIAG_UP = [4, 8, 12, 16, 20];

function getLineName(line: LineSelection): string {
  switch (line.type) {
    case 'row': return `Row ${line.index + 1}`;
    case 'col': return `Col ${line.index + 1}`;
    case 'diag': return line.index === 0 ? 'Diag \u2198' : 'Diag \u2199';
  }
}

/** Given two cell indices, return the line they share (or null). */
function getSharedLine(a: number, b: number): LineSelection | null {
  if (a === b) return null;

  const rowA = Math.floor(a / 5);
  const rowB = Math.floor(b / 5);
  if (rowA === rowB) return { type: 'row', index: rowA };

  const colA = a % 5;
  const colB = b % 5;
  if (colA === colB) return { type: 'col', index: colA };

  if (DIAG_DOWN.includes(a) && DIAG_DOWN.includes(b)) return { type: 'diag', index: 0 };
  if (DIAG_UP.includes(a) && DIAG_UP.includes(b)) return { type: 'diag', index: 1 };

  return null;
}

export function LineSelector({
  onSelect,
  selectedLine,
  isMyTurn,
  partnerHasSelected,
  disabled = false,
}: LineSelectorProps) {
  const [firstTap, setFirstTap] = useState<number | null>(null);
  const [pendingLine, setPendingLine] = useState<LineSelection | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canPick = isMyTurn && !selectedLine;
  const interactable = canPick && !disabled;

  const pendingIndices = pendingLine ? getLineIndices(pendingLine) : [];
  const selectedIndices = selectedLine ? getLineIndices(selectedLine) : [];

  const reset = useCallback(() => {
    setFirstTap(null);
    setPendingLine(null);
  }, []);

  const flashError = useCallback((msg: string) => {
    setError(msg);
    reset();
    setTimeout(() => setError(null), 1200);
  }, [reset]);

  const handleCellClick = (cellIndex: number) => {
    if (!interactable) return;

    // If a line is already pending, tapping a new square changes the second endpoint
    if (pendingLine) {
      // Tapping a cell in the pending line keeps it; tapping outside resets to new first tap
      if (pendingIndices.includes(cellIndex) && cellIndex !== firstTap) {
        // Still on the same line — no change needed
        return;
      }
      // Start fresh with this cell as new first tap
      setPendingLine(null);
      setFirstTap(cellIndex);
      return;
    }

    // No first tap yet — set it
    if (firstTap === null) {
      setFirstTap(cellIndex);
      return;
    }

    // Same cell tapped twice — deselect
    if (cellIndex === firstTap) {
      reset();
      return;
    }

    // Second tap — check for shared line
    const shared = getSharedLine(firstTap, cellIndex);
    if (shared) {
      setPendingLine(shared);
    } else {
      flashError('Those squares don\u2019t share a line');
    }
  };

  const handleConfirm = () => {
    if (pendingLine) {
      onSelect(pendingLine);
      reset();
    }
  };

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
            ? firstTap !== null && !pendingLine
              ? 'Now tap a second square in the same row, column, or diagonal.'
              : pendingLine
              ? `${getLineName(pendingLine)} selected — confirm or tap elsewhere to change.`
              : 'Tap any square to start selecting a line.'
            : 'Your opponent scores when they mark squares in YOUR line.'}
        </p>
      </div>

      {/* Error flash */}
      {error && (
        <div className="text-center p-2 bg-j-error/10 rounded-lg border border-j-error/20 animate-fade-in">
          <p className="text-j-error text-sm font-mono">{error}</p>
        </div>
      )}

      {/* Interactive grid */}
      <div className="max-w-sm mx-auto">
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: 25 }, (_, i) => {
            const isInSelected = selectedIndices.includes(i);
            const isInPending = pendingIndices.includes(i);
            const isFirstTap = firstTap === i && !pendingLine;

            return (
              <button
                key={i}
                onClick={() => handleCellClick(i)}
                disabled={!interactable}
                className={`
                  aspect-square rounded-lg border-2 transition-all duration-150 relative
                  ${isInSelected
                    ? 'bg-j-accent/30 border-j-accent'
                    : isInPending
                    ? 'bg-j-accent/25 border-j-accent/70'
                    : isFirstTap
                    ? 'bg-j-accent/20 border-j-accent/50'
                    : 'bg-j-raised border-white/[0.06]'
                  }
                  ${interactable
                    ? 'cursor-pointer hover:border-j-accent/40 hover:bg-j-hover'
                    : 'cursor-not-allowed opacity-40'
                  }
                `}
              >
                {/* Dot on first-tap cell */}
                {isFirstTap && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-j-accent" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Confirm button */}
      {pendingLine && canPick && (
        <div className="flex justify-center animate-fade-in">
          <button
            onClick={handleConfirm}
            className="px-6 py-2.5 bg-j-accent hover:bg-j-accent-hover text-j-bg font-semibold rounded-xl transition-colors"
          >
            Confirm {getLineName(pendingLine)}
          </button>
        </div>
      )}

      {getStatusMessage()}
    </div>
  );
}

export default LineSelector;
