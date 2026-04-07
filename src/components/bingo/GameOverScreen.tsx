// GameOverScreen - Shown when duo game finishes
import { useState, useEffect } from 'react';
import { useDuoStore } from '../../stores/duoStore';
import { ShareCard } from './ShareCard';

export function GameOverScreen() {
  const {
    odName,
    partnerName,
    myHits,
    partnerHits,
    winner,
    allHit,
    dailySeed,
  } = useDuoStore();

  const [showShare, setShowShare] = useState(false);
  const [countdown, setCountdown] = useState('');

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
    if (winner === 'tie') return "It's a draw!";
    if (winner === 'me') return allHit ? 'All 5 sunk! You win!' : 'You win!';
    return allHit ? `All 5 sunk! ${partnerName || 'Partner'} wins!` : `${partnerName || 'Partner'} wins!`;
  };

  const getWinnerEmoji = () => {
    if (winner === 'tie') return '🤝';
    if (winner === 'me') return '🏆';
    return '😤';
  };

  return (
    <>
      <div className="max-w-2xl mx-auto text-center py-8 space-y-6 animate-fade-in-up">
        {/* Winner announcement */}
        <div className="space-y-3">
          <div className="text-5xl">{getWinnerEmoji()}</div>
          <h2 className="text-3xl font-bold text-j-text tracking-tight">{getWinnerText()}</h2>
          <p className="text-j-muted text-xs font-mono tracking-wider">{dailySeed}</p>
        </div>

        {/* Score cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className={`rounded-xl p-5 transition-all ${winner === 'me' || winner === 'tie' ? 'bg-j-me/15 ring-1 ring-j-me/40' : 'bg-j-raised'}`}>
            <p className="text-j-me font-medium text-xs mb-1 truncate">{odName || 'You'}</p>
            <p className="text-4xl font-bold text-j-me font-mono">{myHits}<span className="text-lg font-normal text-j-me/60">/5</span></p>
            <p className="text-xs text-j-me/60 font-mono mt-1">hits</p>
          </div>
          <div className={`rounded-xl p-5 transition-all ${winner === 'partner' || winner === 'tie' ? 'bg-j-partner/15 ring-1 ring-j-partner/40' : 'bg-j-raised'}`}>
            <p className="text-j-partner font-medium text-xs mb-1 truncate">{partnerName || 'Partner'}</p>
            <p className="text-4xl font-bold text-j-partner font-mono">{partnerHits}<span className="text-lg font-normal text-j-partner/60">/5</span></p>
            <p className="text-xs text-j-partner/60 font-mono mt-1">hits</p>
          </div>
        </div>

        {/* Share button */}
        <button
          onClick={() => setShowShare(true)}
          className="w-full px-6 py-4 bg-j-accent hover:bg-j-accent-hover text-j-bg font-bold text-base rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-j-accent/20"
        >
          Share Result
        </button>

        {/* Next card countdown */}
        <div className="apple-panel p-4">
          <p className="text-j-muted text-xs font-mono uppercase tracking-wider">Next card in</p>
          <p className="text-2xl font-mono font-bold text-j-accent mt-1">{countdown}</p>
          <p className="text-j-muted text-[10px] font-mono mt-1">Resets at UTC midnight</p>
        </div>
      </div>

      {showShare && <ShareCard onClose={() => setShowShare(false)} />}
    </>
  );
}

export default GameOverScreen;
