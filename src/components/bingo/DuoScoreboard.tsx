// DuoScoreboard - Shows duo mode scores and game status
import { useDuoStore } from '../../stores/duoStore';

export function DuoScoreboard() {
  const {
    phase,
    odName,
    partnerName,
    myHits,
    partnerHits,
    dailySeed,
  } = useDuoStore();

  if (phase !== 'playing' && phase !== 'finished') {
    return null;
  }

  const leader = myHits > partnerHits ? 'you' : partnerHits > myHits ? 'partner' : 'tie';

  return (
    <div className="apple-panel p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-j-text">Duo Match</h2>
        <span className="text-[10px] text-j-muted font-mono">{dailySeed}</span>
      </div>

      {/* Score Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded-lg p-3 ${leader === 'you' ? 'bg-j-me/15 ring-1 ring-j-me/40' : 'bg-j-raised'}`}>
          <span className="text-j-me font-medium text-xs truncate block mb-1">{odName || 'You'}</span>
          <div className="text-2xl font-bold text-j-me font-mono">{myHits}<span className="text-sm font-normal text-j-me/60">/5</span></div>
        </div>

        <div className={`rounded-lg p-3 ${leader === 'partner' ? 'bg-j-partner/15 ring-1 ring-j-partner/40' : 'bg-j-raised'}`}>
          <span className="text-j-partner font-medium text-xs truncate block mb-1">{partnerName || 'Partner'}</span>
          <div className="text-2xl font-bold text-j-partner font-mono">{partnerHits}<span className="text-sm font-normal text-j-partner/60">/5</span></div>
        </div>
      </div>

      {/* Scoring Info */}
      <div className="text-[10px] text-j-muted text-center font-mono">
        Find all 5 hidden squares to win · Tiebreaker: most marks
      </div>
    </div>
  );
}

export default DuoScoreboard;
