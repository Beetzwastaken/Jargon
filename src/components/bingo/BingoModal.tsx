import { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { generateEmojiGrid, copyToClipboard } from '../../utils/shareUtils';

const fireConfetti = () => {
  const duration = 3000;
  const end = Date.now() + duration;
  const colors = ['#d4a04a', '#c08930', '#4a9ead', '#5bbdce', '#c67a3c'];

  (function frame() {
    confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors });
    confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  }());
};

interface BoardSquare { text: string; isMarked?: boolean; }

interface BingoModalProps {
  show: boolean;
  onBingo: () => void;
  onCancel: () => void;
  board: BoardSquare[];
  markedSquares: boolean[];
  winningCells?: number[];
  score: number;
  gamesPlayed: number;
  isDuoMode?: boolean;
  duoWinner?: 'me' | 'partner' | 'both';
  myName?: string;
  partnerName?: string;
  myScore?: number;
  partnerScore?: number;
}

export function BingoModal({
  show, onBingo, onCancel, board = [], markedSquares = [], winningCells = [],
  score = 0, gamesPlayed = 1, isDuoMode = false, duoWinner,
  myName = 'You', partnerName = 'Partner', myScore = 0, partnerScore = 0
}: BingoModalProps) {
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  useEffect(() => { if (show) fireConfetti(); }, [show]);

  const handleShare = async () => {
    let shareText: string;
    if (isDuoMode) {
      const winner = myScore > partnerScore ? myName : partnerScore > myScore ? partnerName : 'Tie!';
      shareText = `🎰 Jargon - Duo Mode\n\n`;
      shareText += `${myName}: ${myScore} pts\n`;
      shareText += `${partnerName}: ${partnerScore} pts\n\n`;
      shareText += `Winner: ${winner} 🏆\n\n`;
      shareText += `Play at: https://playjargon.com`;
    } else {
      shareText = generateEmojiGrid({ board, markedSquares, winningCells, score, gamesPlayed });
    }
    const success = await copyToClipboard(shareText);
    if (success) { setShareStatus('copied'); setTimeout(() => setShareStatus('idle'), 2000); }
    else { setShareStatus('error'); setTimeout(() => setShareStatus('idle'), 2000); }
  };

  if (!show) return null;

  const getDuoTitle = () => {
    if (duoWinner === 'both') return 'Both Got BINGO!';
    if (duoWinner === 'me') return 'You Got BINGO!';
    return 'Partner Got BINGO!';
  };

  const getDuoSubtitle = () => {
    if (duoWinner === 'me') return 'Congratulations! You completed your line!';
    if (duoWinner === 'partner') return `${partnerName} completed their line!`;
    return 'Incredible! You both completed your lines!';
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm z-[1000]" onClick={onCancel} />

      <div className="fixed top-1/3 left-1/2 transform -translate-x-1/2 z-[1001] animate-fade-in-up w-full max-w-md px-4">
        <div className="bg-j-surface border border-j-accent/40 rounded-2xl shadow-2xl p-6 sm:p-8">
          <div className="text-center mb-6">
            <h2 className="text-4xl font-bold text-j-accent tracking-wider">
              🎉 {isDuoMode ? getDuoTitle() : 'BINGO!'} 🎉
            </h2>
            <p className="text-j-secondary mt-3 text-base">
              {isDuoMode ? getDuoSubtitle() : 'Congratulations! You got a BINGO!'}
            </p>
          </div>

          {isDuoMode && (
            <div className="mb-6 p-4 bg-j-raised rounded-xl">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className={`p-3 rounded-lg ${myScore >= partnerScore ? 'bg-j-me/15 ring-1 ring-j-me/40' : ''}`}>
                  <div className="text-j-me font-medium text-sm">{myName}</div>
                  <div className="text-3xl font-bold text-j-me font-mono">{myScore}</div>
                </div>
                <div className={`p-3 rounded-lg ${partnerScore >= myScore ? 'bg-j-partner/15 ring-1 ring-j-partner/40' : ''}`}>
                  <div className="text-j-partner font-medium text-sm">{partnerName}</div>
                  <div className="text-3xl font-bold text-j-partner font-mono">{partnerScore}</div>
                </div>
              </div>
              {myScore !== partnerScore && (
                <div className="text-center mt-3 text-j-accent font-medium text-sm">
                  {myScore > partnerScore ? `${myName} wins!` : `${partnerName} wins!`}
                </div>
              )}
            </div>
          )}

          <div className="mb-4">
            <button
              onClick={handleShare}
              className="w-full px-6 py-4 bg-j-accent hover:bg-j-accent-hover text-j-bg font-bold text-base rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-j-accent/20 flex items-center justify-center gap-2"
            >
              {shareStatus === 'idle' && <span>Share Result</span>}
              {shareStatus === 'copied' && <span>Copied!</span>}
              {shareStatus === 'error' && <span>Copy Failed</span>}
            </button>
            <p className="text-center text-j-muted text-xs font-mono mt-2">
              {isDuoMode ? 'Share your duo match result' : 'Share your BINGO with coworkers'}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-6 py-3 bg-j-raised hover:bg-j-hover text-j-text font-medium rounded-xl transition-colors"
            >
              {isDuoMode ? 'Close' : 'Cancel'}
            </button>
            {!isDuoMode && (
              <button
                onClick={onBingo}
                className="flex-1 px-6 py-3 bg-j-accent hover:bg-j-accent-hover text-j-bg font-bold rounded-xl transition-colors"
              >
                Confirm BINGO
              </button>
            )}
          </div>

          <p className="text-center text-j-muted text-xs font-mono mt-4">
            {isDuoMode ? 'New card tomorrow at midnight' : 'Click backdrop or Cancel if mistake'}
          </p>
        </div>
      </div>
    </>
  );
}
