import { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { generateEmojiGrid, copyToClipboard } from '../../utils/shareUtils';

// Fire confetti celebration
const fireConfetti = () => {
  const duration = 3000;
  const end = Date.now() + duration;

  const colors = ['#fbbf24', '#f59e0b', '#22d3ee', '#3b82f6', '#a855f7'];

  (function frame() {
    confetti({
      particleCount: 5,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors: colors
    });
    confetti({
      particleCount: 5,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors: colors
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  }());
};

interface BoardSquare {
  text: string;
  isMarked?: boolean;
}

interface BingoModalProps {
  show: boolean;
  onBingo: () => void;
  onCancel: () => void;
  board: BoardSquare[];
  markedSquares: boolean[];
  winningCells?: number[];
  score: number;
  gamesPlayed: number;
  // Duo mode props
  isDuoMode?: boolean;
  duoWinner?: 'me' | 'partner' | 'both';
  myName?: string;
  partnerName?: string;
  myScore?: number;
  partnerScore?: number;
}

export function BingoModal({
  show,
  onBingo,
  onCancel,
  board = [],
  markedSquares = [],
  winningCells = [],
  score = 0,
  gamesPlayed = 1,
  isDuoMode = false,
  duoWinner,
  myName = 'You',
  partnerName = 'Partner',
  myScore = 0,
  partnerScore = 0
}: BingoModalProps) {
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  // Fire confetti when modal shows
  useEffect(() => {
    if (show) {
      fireConfetti();
    }
  }, [show]);

  const handleShare = async () => {
    let shareText: string;

    if (isDuoMode) {
      // Generate duo mode share text
      const winner = myScore > partnerScore ? myName : partnerScore > myScore ? partnerName : 'Tie!';
      shareText = `🎰 Jargon - Duo Mode\n\n`;
      shareText += `${myName}: ${myScore} pts\n`;
      shareText += `${partnerName}: ${partnerScore} pts\n\n`;
      shareText += `Winner: ${winner} 🏆\n\n`;
      shareText += `Play at: https://playjargon.com`;
    } else {
      shareText = generateEmojiGrid({
        board,
        markedSquares,
        winningCells,
        score,
        gamesPlayed
      });
    }

    const success = await copyToClipboard(shareText);

    if (success) {
      setShareStatus('copied');
      setTimeout(() => setShareStatus('idle'), 2000);
    } else {
      setShareStatus('error');
      setTimeout(() => setShareStatus('idle'), 2000);
    }
  };

  if (!show) {
    return null;
  }

  // Duo mode title
  const getDuoTitle = () => {
    if (duoWinner === 'both') return 'Both Got BINGO!';
    if (duoWinner === 'me') return 'You Got BINGO!';
    return 'Partner Got BINGO!';
  };

  // Duo mode subtitle
  const getDuoSubtitle = () => {
    if (duoWinner === 'me') return 'Congratulations! You completed your line!';
    if (duoWinner === 'partner') return `${partnerName} completed their line!`;
    return 'Incredible! You both completed your lines!';
  };

  return (
    <>
      {/* Backdrop with blur */}
      <div
        className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm z-[1000] animate-fadeIn"
        onClick={onCancel}
      />

      {/* Centered Modal */}
      <div className="fixed top-1/3 left-1/2 transform -translate-x-1/2 z-[1001] animate-scaleIn">
        <div className="bg-apple-dark border-2 border-yellow-400 rounded-2xl shadow-2xl p-8 max-w-md">
          {/* BINGO Title */}
          <div className="text-center mb-6">
            <h2 className="text-5xl font-bold text-yellow-400 animate-pulse tracking-wider">
              🎉 {isDuoMode ? getDuoTitle() : 'BINGO!'} 🎉
            </h2>
            <p className="text-apple-secondary mt-4 text-lg">
              {isDuoMode ? getDuoSubtitle() : 'Congratulations! You got a BINGO!'}
            </p>
          </div>

          {/* Duo Mode Score Summary */}
          {isDuoMode && (
            <div className="mb-6 p-4 bg-apple-darkest rounded-xl">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className={`p-3 rounded-lg ${myScore >= partnerScore ? 'bg-cyan-500/20 ring-2 ring-cyan-500' : ''}`}>
                  <div className="text-cyan-400 font-medium text-sm">{myName}</div>
                  <div className="text-3xl font-bold text-cyan-400">{myScore}</div>
                </div>
                <div className={`p-3 rounded-lg ${partnerScore >= myScore ? 'bg-orange-500/20 ring-2 ring-orange-500' : ''}`}>
                  <div className="text-orange-400 font-medium text-sm">{partnerName}</div>
                  <div className="text-3xl font-bold text-orange-400">{partnerScore}</div>
                </div>
              </div>
              {myScore !== partnerScore && (
                <div className="text-center mt-3 text-yellow-400 font-medium">
                  {myScore > partnerScore ? `${myName} wins!` : `${partnerName} wins!`}
                </div>
              )}
            </div>
          )}

          {/* Share Button - Primary Action */}
          <div className="mb-4">
            <button
              onClick={handleShare}
              className="w-full px-6 py-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-bold text-lg rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg flex items-center justify-center gap-2"
            >
              {shareStatus === 'idle' && (
                <>
                  <span>📋</span>
                  <span>Share Result</span>
                </>
              )}
              {shareStatus === 'copied' && (
                <>
                  <span>✓</span>
                  <span>Copied to Clipboard!</span>
                </>
              )}
              {shareStatus === 'error' && (
                <>
                  <span>✗</span>
                  <span>Copy Failed</span>
                </>
              )}
            </button>
            <p className="text-center text-apple-tertiary text-xs mt-2">
              {isDuoMode ? 'Share your duo match result!' : 'Share your BINGO with friends & coworkers!'}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <button
              onClick={onCancel}
              className="flex-1 px-6 py-4 bg-gray-600 hover:bg-gray-700 text-white font-bold text-lg rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg"
            >
              {isDuoMode ? 'Close' : 'Cancel'}
            </button>
            {!isDuoMode && (
              <button
                onClick={onBingo}
                className="flex-1 px-6 py-4 bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-black font-bold text-lg rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg"
              >
                Confirm BINGO
              </button>
            )}
          </div>

          {/* Hint Text */}
          <p className="text-center text-apple-tertiary text-sm mt-4">
            {isDuoMode
              ? 'New card tomorrow at midnight!'
              : 'Click backdrop or Cancel if this was a mistake'}
          </p>
        </div>
      </div>
    </>
  );
}
