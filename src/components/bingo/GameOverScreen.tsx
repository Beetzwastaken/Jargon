// GameOverScreen - Shown when duo game finishes
import { useState, useEffect } from 'react';
import { useDuoStore } from '../../stores/duoStore';
import { ShareCard } from './ShareCard';

export function GameOverScreen() {
  const {
    odName,
    partnerName,
    myScore,
    partnerScore,
    winner,
    dailySeed,
  } = useDuoStore();

  const [showShare, setShowShare] = useState(false);
  const [countdown, setCountdown] = useState('');

  // Countdown to UTC midnight
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      const diff = tomorrow.getTime() - now.getTime();

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setCountdown(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  const getWinnerText = () => {
    if (winner === 'tie') return "It's a tie!";
    if (winner === 'me') return 'You win!';
    return `${partnerName || 'Partner'} wins!`;
  };

  const getWinnerEmoji = () => {
    if (winner === 'tie') return '🤝';
    if (winner === 'me') return '🏆';
    return '😤';
  };

  return (
    <>
      <div className="max-w-lg mx-auto text-center py-8 space-y-8">
        {/* Winner announcement */}
        <div className="space-y-4">
          <div className="text-6xl">{getWinnerEmoji()}</div>
          <h2 className="text-3xl font-bold text-apple-text">{getWinnerText()}</h2>
          <p className="text-apple-secondary text-sm font-mono">{dailySeed}</p>
        </div>

        {/* Score cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className={`rounded-xl p-6 ${winner === 'me' || winner === 'tie' ? 'bg-cyan-500/20 ring-2 ring-cyan-500' : 'bg-apple-darkest'}`}>
            <p className="text-cyan-400 font-medium text-sm mb-2">{odName || 'You'}</p>
            <p className="text-4xl font-bold text-cyan-400">{myScore}/5</p>
          </div>
          <div className={`rounded-xl p-6 ${winner === 'partner' || winner === 'tie' ? 'bg-orange-500/20 ring-2 ring-orange-500' : 'bg-apple-darkest'}`}>
            <p className="text-orange-400 font-medium text-sm mb-2">{partnerName || 'Partner'}</p>
            <p className="text-4xl font-bold text-orange-400">{partnerScore}/5</p>
          </div>
        </div>

        {/* Share button */}
        <button
          onClick={() => setShowShare(true)}
          className="w-full px-6 py-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-bold text-lg rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg"
        >
          Share Result
        </button>

        {/* Next card countdown */}
        <div className="apple-panel p-4">
          <p className="text-apple-tertiary text-sm">Next card in</p>
          <p className="text-2xl font-mono font-bold text-apple-text mt-1">{countdown}</p>
          <p className="text-apple-tertiary text-xs mt-1">Resets at UTC midnight</p>
        </div>
      </div>

      {/* Share modal */}
      {showShare && <ShareCard onClose={() => setShowShare(false)} />}
    </>
  );
}

export default GameOverScreen;
