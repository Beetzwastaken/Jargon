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
    markSquare
  } = useSoloStore();

  const [showBingoModal, setShowBingoModal] = useState(false);

  // Initialize card on mount
  useEffect(() => {
    initializeCard();
  }, [initializeCard]);

  // Watch for bingo
  useEffect(() => {
    if (hasBingo) {
      setShowBingoModal(true);
      showGameToast('BINGO!', 'You completed your line!', 'success');
    }
  }, [hasBingo]);

  const handleSquareClick = (index: number) => {
    markSquare(index);
  };

  const dateStr = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });

  const boardSquares = dailyCard.map((square, index) => ({
    ...square,
    isMarked: markedSquares[index] || false
  }));

  return (
    <div className="h-screen bg-black text-white font-system flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-apple-dark border-b border-apple-border z-50 backdrop-blur-xl bg-opacity-80 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 via-purple-600 to-purple-700 flex items-center justify-center shadow-lg border border-purple-400/30 relative overflow-hidden">
                <img
                  src={jargonLogo}
                  alt="Jargon"
                  className="w-6 h-6 relative z-10"
                />
              </div>
              <div>
                <h1 className="text-lg font-medium text-apple-text">Jargon</h1>
                <span className="text-xs text-apple-tertiary">Solo Mode</span>
              </div>
            </div>

            {/* Center - Date */}
            <div className="hidden md:block text-center">
              <p className="text-xs text-apple-tertiary uppercase tracking-wider">Today's Card</p>
              <p className="text-sm font-medium text-apple-text">{dateStr}</p>
            </div>

            {/* Right - Back button */}
            <button
              onClick={onBack}
              className="px-3 py-1.5 text-sm text-apple-secondary hover:text-apple-text hover:bg-apple-hover rounded-md transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Main Content */}
        <main className="flex-1 overflow-auto p-4">
          <div className="max-w-2xl mx-auto">
            {dailyCard.length > 0 && (
              <>
                {/* Score Section */}
                <div className="mb-6 grid grid-cols-3 gap-3">
                  <div className="apple-panel p-3 text-center">
                    <p className="text-xs text-apple-tertiary uppercase tracking-wider mb-1">
                      Current Score
                    </p>
                    <p className="text-2xl font-bold text-cyan-400">{score}</p>
                  </div>
                  <div className="apple-panel p-3 text-center">
                    <p className="text-xs text-apple-tertiary uppercase tracking-wider mb-1">
                      Total Score
                    </p>
                    <p className="text-2xl font-bold text-purple-400">{totalScore}</p>
                  </div>
                  <div className="apple-panel p-3 text-center">
                    <p className="text-xs text-apple-tertiary uppercase tracking-wider mb-1">
                      Games
                    </p>
                    <p className="text-2xl font-bold text-orange-400">{gamesPlayed}</p>
                  </div>
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
                  <h3 className="text-sm font-medium text-apple-secondary mb-2">Scoring</h3>
                  <ul className="text-xs text-apple-tertiary space-y-1">
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

      {/* Bingo Modal */}
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

      {/* Toast Notifications */}
      <ToastContainer />
    </div>
  );
}
