import { useCallback, useRef } from 'react';
import type { BingoSquare } from '../../types';
import type { MarkEntry } from '../../stores/duoStore';

interface BingoCardProps {
  squares: BingoSquare[];
  onSquareClick: (index: number) => void;
  myPlayerId: string;
  marks: MarkEntry[];
  myLineIndices: number[];
  phase: 'playing' | 'finished';
  partnerLineIndices?: number[];
  hasBingo?: boolean;
  isHost?: boolean; // true = host (teal), false = partner (amber), undefined = solo
}

export function BingoCard({
  squares,
  onSquareClick,
  myPlayerId,
  marks,
  myLineIndices,
  phase,
  partnerLineIndices = [],
  hasBingo = false,
  isHost,
}: BingoCardProps) {
  // Host always teal (marked-mine), partner always amber (marked-partner)
  // If I'm the partner, swap: my marks get amber, opponent's marks get teal
  const iAmPartner = isHost === false;
  const gridRef = useRef<HTMLDivElement>(null);

  const getMarkInfo = (index: number) => {
    const myMark = marks.find(m => m.index === index && m.markedBy === myPlayerId);
    const partnerMark = marks.find(m => m.index === index && m.markedBy !== myPlayerId);
    return { myMark: !!myMark, partnerMark: !!partnerMark };
  };

  const getSquareClasses = (index: number) => {
    let classes = 'bingo-square';
    const { myMark, partnerMark } = getMarkInfo(index);
    const isMyLine = myLineIndices.includes(index);
    const isPartnerLine = phase === 'finished' && partnerLineIndices.includes(index);

    // Line indicator — subtle ring in new palette
    if (isMyLine && isPartnerLine) {
      classes += ' ring-1 ring-j-accent/50';
    } else if (isMyLine) {
      classes += ' ring-1 ring-j-me/40';
    } else if (isPartnerLine) {
      classes += ' ring-1 ring-j-partner/40';
    }

    // Mark colors — host always teal, partner always amber
    if (myMark && partnerMark) {
      classes += ' marked';
    } else if (myMark) {
      classes += iAmPartner ? ' marked marked-partner' : ' marked marked-mine';
    } else if (partnerMark) {
      classes += iAmPartner ? ' marked marked-mine' : ' marked marked-partner';
    }

    if (hasBingo && (myMark || partnerMark)) {
      classes += ' winning';
    }

    return classes;
  };

  const handleKeyDown = useCallback((event: React.KeyboardEvent, index: number) => {
    const gridSize = 5;
    let newIndex = index;

    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        newIndex = Math.max(0, index - gridSize);
        break;
      case 'ArrowDown':
        event.preventDefault();
        newIndex = Math.min(squares.length - 1, index + gridSize);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (index % gridSize > 0) newIndex = index - 1;
        break;
      case 'ArrowRight':
        event.preventDefault();
        if (index % gridSize < gridSize - 1) newIndex = index + 1;
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        onSquareClick(index);
        return;
      case 'Home':
        event.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        event.preventDefault();
        newIndex = squares.length - 1;
        break;
      default:
        return;
    }

    const newSquareElement = document.querySelector(`button[data-square-index="${newIndex}"]`) as HTMLButtonElement;
    newSquareElement?.focus();
  }, [squares, onSquareClick]);

  const getAriaLabel = useCallback((square: BingoSquare, index: number) => {
    const row = Math.floor(index / 5) + 1;
    const col = (index % 5) + 1;
    const position = `Row ${row}, Column ${col}`;
    const { myMark, partnerMark } = getMarkInfo(index);

    let lineInfo = '';
    const isMyLine = myLineIndices.includes(index);
    const isPartnerLine = phase === 'finished' && partnerLineIndices.includes(index);
    if (isMyLine && isPartnerLine) {
      lineInfo = ', in both lines';
    } else if (isMyLine) {
      lineInfo = ', in your line';
    } else if (isPartnerLine) {
      lineInfo = ', in partner line';
    }

    let markStatus = 'unmarked';
    if (myMark && partnerMark) markStatus = 'marked by both';
    else if (myMark) markStatus = 'marked by you';
    else if (partnerMark) markStatus = 'marked by partner';

    return `${square.text}, ${position}, ${markStatus}${lineInfo}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myPlayerId, marks, myLineIndices, partnerLineIndices, phase]);

  const totalMarked = marks.length;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Legend — host always teal, partner always amber */}
      <div className="flex flex-wrap justify-center gap-4 mb-4 text-xs font-mono">
        <div className="flex items-center gap-1.5">
          <div className={`w-2.5 h-2.5 rounded-sm ${iAmPartner ? 'bg-j-partner/70' : 'bg-j-me/70'}`}></div>
          <span className={iAmPartner ? 'text-j-partner' : 'text-j-me'}>Your marks</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-2.5 h-2.5 rounded-sm ${iAmPartner ? 'bg-j-me/70' : 'bg-j-partner/70'}`}></div>
          <span className={iAmPartner ? 'text-j-me' : 'text-j-partner'}>Partner marks</span>
        </div>
        {phase === 'finished' && (
          <>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm ring-1 ring-j-me/50 bg-transparent"></div>
              <span className="text-j-me">Your line</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm ring-1 ring-j-partner/50 bg-transparent"></div>
              <span className="text-j-partner">Partner line</span>
            </div>
          </>
        )}
      </div>

      {/* 5x5 Bingo Grid */}
      <div
        className="bingo-grid"
        ref={gridRef}
        role="grid"
        aria-label="Jargon Card - 5x5 grid"
        aria-describedby="bingo-instructions"
      >
        {squares.map((square, index) => {
          const { myMark, partnerMark } = getMarkInfo(index);

          return (
            <button
              key={square.id}
              data-square-index={index}
              onClick={() => onSquareClick(index)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={getSquareClasses(index)}
              role="gridcell"
              aria-label={getAriaLabel(square, index)}
              aria-pressed={myMark || partnerMark}
              tabIndex={index === 0 ? 0 : -1}
              disabled={phase === 'finished'}
            >
              {/* Checkmark overlay — host=teal, partner=amber */}
              {(myMark || partnerMark) && (
                <div className="absolute top-0.5 right-0.5 z-10 flex gap-0.5">
                  {myMark && (
                    <div className={`w-3.5 h-3.5 ${iAmPartner ? 'bg-j-partner' : 'bg-j-me'} rounded-full flex items-center justify-center shadow-sm`}>
                      <svg className="w-2 h-2 text-j-bg" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                  {partnerMark && (
                    <div className={`w-3.5 h-3.5 ${iAmPartner ? 'bg-j-me' : 'bg-j-partner'} rounded-full flex items-center justify-center shadow-sm`}>
                      <svg className="w-2 h-2 text-j-bg" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>
              )}

              <span className="relative z-0 pointer-events-none">
                {square.text}
              </span>
            </button>
          );
        })}
      </div>

      <div id="bingo-instructions" className="sr-only">
        Use arrow keys to navigate the bingo grid. Press Enter or Space to mark a square when you hear the phrase mentioned.
      </div>

      {/* Game Progress */}
      <div className="mt-4 flex items-center justify-between px-1">
        <div className="text-xs text-j-secondary font-mono">
          Marked: {totalMarked}
        </div>
        <div className="text-xs text-j-muted font-mono">
          Tap matching phrases
        </div>
      </div>
    </div>
  );
}
