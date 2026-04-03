import { JargonLogo } from './JargonLogo';

interface ModeSelectorProps {
  onSelectMode: (mode: 'solo' | 'duo') => void;
}

export function ModeSelector({ onSelectMode }: ModeSelectorProps) {
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  });

  return (
    <div className="h-screen bg-j-bg text-j-text font-display flex flex-col items-center justify-center overflow-hidden relative">
      {/* Subtle radial glow behind logo */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-j-accent/[0.04] rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="text-center mb-14 relative animate-fade-in-up">
        <div className="w-16 h-16 mx-auto mb-5">
          <JargonLogo size={64} />
        </div>
        <h1 className="text-5xl font-bold tracking-tight mb-2">
          <span className="text-j-accent">Jar</span><span className="text-j-text">gon</span>
        </h1>
        <p className="text-j-secondary text-base tracking-wide font-mono text-sm">
          buzzword bingo for meetings
        </p>
      </div>

      {/* Mode cards */}
      <div className="flex flex-col gap-4 max-w-xl w-full px-6 relative">
        {/* Solo */}
        <button
          onClick={() => onSelectMode('solo')}
          className="group p-6 bg-j-surface hover:bg-j-hover border border-j-muted/20 hover:border-j-me/30 rounded-2xl transition-all duration-200 text-left animate-fade-in-up stagger-1"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold text-j-text group-hover:text-j-me transition-colors">Solo</h2>
            <span className="text-j-tertiary text-xs font-mono uppercase tracking-wider">Any meeting</span>
          </div>
          <p className="text-j-tertiary text-sm leading-relaxed">
            Tap buzzwords as you hear them. See how many you can spot.
          </p>
          <div className="mt-4 flex items-center gap-2 text-j-me/60 group-hover:text-j-me/90 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
            <span className="text-xs font-mono">Start playing</span>
          </div>
        </button>

        {/* Duo */}
        <button
          onClick={() => onSelectMode('duo')}
          className="group p-6 bg-j-surface hover:bg-j-hover border border-j-muted/20 hover:border-j-accent/30 rounded-2xl transition-all duration-200 text-left animate-fade-in-up stagger-2"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold text-j-text group-hover:text-j-accent transition-colors">Duo</h2>
            <span className="text-j-tertiary text-xs font-mono uppercase tracking-wider">2 players</span>
          </div>
          <p className="text-j-tertiary text-sm leading-relaxed">
            Pair with a colleague. Mark buzzwords, complete lines, hunt their secret line.
          </p>
          <div className="mt-4 flex items-center gap-2 text-j-accent/60 group-hover:text-j-accent/90 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
            <span className="text-xs font-mono">Find a partner</span>
          </div>
        </button>
      </div>

      {/* Footer */}
      <div className="mt-14 text-center animate-fade-in-up stagger-3">
        <p className="text-j-muted text-xs font-mono tracking-wider uppercase">
          Today's card &middot; <span className="text-j-tertiary">{dateStr}</span>
        </p>
      </div>
    </div>
  );
}
