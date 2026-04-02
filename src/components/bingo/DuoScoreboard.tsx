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
    <div className="apple-panel p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-apple-text">Duo Match</h2>
        <span className="text-xs text-apple-tertiary font-mono">{dailySeed}</span>
      </div>

      {/* Score Cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* Your Score */}
        <div className={`rounded-lg p-3 ${leader === 'you' ? 'bg-cyan-500/20 ring-2 ring-cyan-500' : 'bg-apple-darkest'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-cyan-400 font-medium text-sm truncate">{odName || 'You'}</span>
          </div>
          <div className="text-3xl font-bold text-cyan-400">{myScore}/5</div>
        </div>

        {/* Partner Score */}
        <div className={`rounded-lg p-3 ${leader === 'partner' ? 'bg-orange-500/20 ring-2 ring-orange-500' : 'bg-apple-darkest'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-orange-400 font-medium text-sm truncate">{partnerName || 'Partner'}</span>
          </div>
          <div className="text-3xl font-bold text-orange-400">{partnerScore}/5</div>
        </div>
      </div>

      {/* Scoring Info */}
      <div className="text-xs text-apple-tertiary text-center">
        <span>Score = opponent's line squares YOU marked</span>
        <span className="mx-2">|</span>
        <span>5/5 = BINGO</span>
      </div>
    </div>
  );
}

export default DuoScoreboard;
