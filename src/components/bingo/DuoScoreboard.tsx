// DuoScoreboard - Shows duo mode scores and game status
import { useDuoStore } from '../../stores/duoStore';

export function DuoScoreboard() {
  const {
    phase,
    odName,
    partnerName,
    myScore,
    partnerScore,
    dailySeed,
  } = useDuoStore();

  if (phase !== 'playing' && phase !== 'finished') {
    return null;
  }

  const leader = myScore > partnerScore ? 'you' : partnerScore > myScore ? 'partner' : 'tie';

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
          <div className="text-2xl font-bold text-j-me font-mono">{myScore}/5</div>
        </div>

        <div className={`rounded-lg p-3 ${leader === 'partner' ? 'bg-j-partner/15 ring-1 ring-j-partner/40' : 'bg-j-raised'}`}>
          <span className="text-j-partner font-medium text-xs truncate block mb-1">{partnerName || 'Partner'}</span>
          <div className="text-2xl font-bold text-j-partner font-mono">{partnerScore}/5</div>
        </div>
      </div>

      {/* Scoring Info */}
      <div className="text-[10px] text-j-muted text-center font-mono">
        <span>Score = opponent's line squares YOU marked</span>
        <span className="mx-1">|</span>
        <span>5/5 = BINGO</span>
      </div>
    </div>
  );
}

export default DuoScoreboard;
