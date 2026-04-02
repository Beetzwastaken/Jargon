import { useEffect, useState } from 'react';
import { BingoCard } from './bingo/BingoCard';
import { BingoModal } from './bingo/BingoModal';
import { useSoloStore } from '../stores/soloStore';
import { ToastContainer, showGameToast } from './shared/ToastNotification';
import jargonLogo from '../assets/jargon-logo.svg';

interface SoloGameProps {
  onBack: () => void;
}

export function SoloGame({ onBack }: SoloGameProps) {
  const {
    dailyCard,
    markedSquares,
    score,
    hasBingo,
    totalScore,
    gamesPlayed,
    initializeCard,
    markSquare,
    shuffleNewCard
  } = useSoloStore();

  const [showBingoModal, setShowBingoModal] = useState(false);

  useEffect(() => {
    initializeCard();
  }, [initializeCard]);

  useEffect(() => {
    if (hasBingo) {
      setShowBingoModal(true);
      showGameToast('BINGO!', 'You completed your line!', 'success');
    }
  }, [hasBingo]);

  const handleSquareClick = (index: number) => {
    markSquare(index);
  };

  const boardSquares = dailyCard.map((square, index) => ({
    ...square,
    isMarked: markedSquares[index] || false
  }));

  return (
    <div className="h-screen bg-j-bg text-j-text font-display flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-j-surface/80 border-b border-white/[0.06] z-50 backdrop-blur-xl flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center space-x-3">
              <img src={jargonLogo} alt="Jargon" className="w-9 h-9 rounded-lg" />
              <div>
                <h1 className="text-base font-semibold text-j-text tracking-tight">Jargon</h1>
                <span className="text-[10px] text-j-tertiary font-mono uppercase tracking-wider">Solo Mode</span>
              </div>
            </div>

            <button
              onClick={onBack}
              className="px-3 py-1.5 text-sm text-j-secondary hover:text-j-text hover:bg-j-hover rounded-md transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden min-h-0">
        <main className="flex-1 overflow-auto p-4">
          <div className="max-w-4xl mx-auto">
            {dailyCard.length > 0 && (
              <>
                {/* Score Section */}
                <div className="mb-6 grid grid-cols-3 gap-3">
                  <div className="apple-panel p-3 text-center">
                    <p className="text-[10px] text-j-tertiary uppercase tracking-wider font-mono mb-1">
                      Current Score
                    </p>
                    <p className="text-2xl font-bold text-j-accent">{score}</p>
                  </div>
                  <div className="apple-panel p-3 text-center">
                    <p className="text-[10px] text-j-tertiary uppercase tracking-wider font-mono mb-1">
                      Total Score
                    </p>
                    <p className="text-2xl font-bold text-j-text">{totalScore}</p>
                  </div>
                  <div className="apple-panel p-3 text-center">
                    <p className="text-[10px] text-j-tertiary uppercase tracking-wider font-mono mb-1">
                      Games
                    </p>
                    <p className="text-2xl font-bold text-j-me">{gamesPlayed}</p>
                  </div>
                </div>

                {/* New Card button */}
                <div className="mb-4 text-center">
                  <button
                    onClick={shuffleNewCard}
                    className="px-4 py-2 bg-j-raised hover:bg-j-hover border border-white/[0.06] text-j-secondary hover:text-j-text rounded-lg transition-colors text-xs font-mono"
                  >
                    Shuffle New Card
                  </button>
                </div>

                {/* Bingo Card */}
                <BingoCard
                  squares={boardSquares}
                  onSquareClick={handleSquareClick}
                  myPlayerId="solo"
                  marks={markedSquares.map((marked, i) => marked ? { index: i, markedBy: 'solo' } : null).filter((m): m is { index: number; markedBy: string } => m !== null)}
                  myLineIndices={[]}
                  phase="playing"
                  hasBingo={hasBingo}
                />

                {/* Instructions */}
                <div className="mt-6 apple-panel p-4">
                  <h3 className="text-sm font-semibold text-j-secondary mb-2">Scoring</h3>
                  <ul className="text-xs text-j-tertiary space-y-1 font-mono">
                    <li>+1 point per square marked</li>
                    <li>+5 bonus for completing a line (BINGO)</li>
                    <li>New card at midnight in your timezone</li>
                  </ul>
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      <BingoModal
        show={showBingoModal}
        onBingo={() => setShowBingoModal(false)}
        onCancel={() => setShowBingoModal(false)}
        board={dailyCard}
        markedSquares={markedSquares}
        score={score}
        gamesPlayed={gamesPlayed}
        isDuoMode={false}
      />

      <ToastContainer />
    </div>
  );
}
