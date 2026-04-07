// SquareSelector - Tap to toggle up to 5 squares for battleship placement
import { useState, useCallback } from 'react';

interface SquareSelectorProps {
  onSelect: (squares: number[]) => void;
  myReady: boolean;
  partnerReady: boolean;
  disabled?: boolean;
}

const MAX_SQUARES = 5;

export function SquareSelector({
  onSelect,
  myReady,
  partnerReady,
  disabled = false,
}: SquareSelectorProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const atLimit = selected.size >= MAX_SQUARES;

  const handleToggle = useCallback(
    (i: number) => {
      if (myReady || disabled) return;

      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(i)) {
          next.delete(i);
        } else if (next.size < MAX_SQUARES) {
          next.add(i);
        }
        // at limit + unselected → do nothing
        return next;
      });
    },
    [myReady, disabled],
  );

  const handleLockIn = () => {
    if (selected.size === MAX_SQUARES) {
      onSelect(Array.from(selected).sort((a, b) => a - b));
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-lg font-semibold text-j-text mb-2 tracking-tight">
          Hide Your Squares
        </h2>
        <p className="text-j-tertiary text-sm">
          {myReady
            ? 'Squares locked in.'
            : `Tap 5 squares to hide. ${selected.size}/${MAX_SQUARES} selected.`}
        </p>
      </div>

      {/* Grid */}
      <div className="max-w-sm mx-auto">
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: 25 }, (_, i) => {
            const isSelected = selected.has(i);
            const isDisabledSquare =
              myReady || disabled || (!isSelected && atLimit);

            return (
              <button
                key={i}
                onClick={() => handleToggle(i)}
                disabled={isDisabledSquare}
                className={`
                  aspect-square rounded-lg border-2 transition-all duration-150 relative
                  ${
                    isSelected
                      ? 'bg-j-accent/30 border-j-accent'
                      : 'bg-j-raised border-white/[0.06]'
                  }
                  ${
                    isDisabledSquare
                      ? 'cursor-not-allowed opacity-40'
                      : 'cursor-pointer hover:border-j-accent/40 hover:bg-j-hover'
                  }
                `}
              >
                {isSelected && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-j-accent" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Lock In button */}
      {atLimit && !myReady && (
        <div className="flex justify-center animate-fade-in">
          <button
            onClick={handleLockIn}
            className="px-6 py-2.5 bg-j-accent hover:bg-j-accent-hover text-j-bg font-semibold rounded-xl transition-colors"
          >
            Lock In Squares
          </button>
        </div>
      )}

      {/* Status panel */}
      {myReady && (
        <div className="text-center p-3 bg-j-accent/10 rounded-lg border border-j-accent/20">
          <p className="text-j-accent font-medium text-sm">
            Your squares are locked in!
          </p>
          {!partnerReady && (
            <p className="text-j-tertiary text-xs font-mono mt-1">
              Waiting for partner...
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default SquareSelector;
