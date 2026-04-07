// RoomManager - Duo pairing UI
import { useState } from 'react';
import { useDuoStore } from '../../stores/duoStore';
import { showGameToast } from '../shared/ToastNotification';

type View = 'main' | 'create' | 'join';

interface RoomManagerProps {
  initialJoinCode?: string | null;
}

export function RoomManager({ initialJoinCode }: RoomManagerProps = {}) {
  const [view, setView] = useState<View>(initialJoinCode ? 'join' : 'main');
  const [playerName, setPlayerName] = useState('');
  const [joinCode, setJoinCode] = useState(initialJoinCode || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    phase,
    pairCode,
    odName,
    partnerName,
    isPaired,
    isHost,
    createGame,
    joinGame,
    leaveGame
  } = useDuoStore();

  const handleCreateGame = async () => {
    if (!playerName.trim()) { setError('Please enter your name'); return; }
    setIsLoading(true);
    setError(null);
    const result = await createGame(playerName.trim());
    setIsLoading(false);
    if (result.success) {
      showGameToast('Game Created', `Share code: ${result.code}`, 'success');
    } else {
      setError(result.error || 'Failed to create game');
    }
  };

  const handleJoinGame = async () => {
    if (!playerName.trim()) { setError('Please enter your name'); return; }
    if (!joinCode.trim() || joinCode.length !== 4) { setError('Please enter a 4-character code'); return; }
    setIsLoading(true);
    setError(null);
    const result = await joinGame(joinCode.trim().toUpperCase(), playerName.trim());
    setIsLoading(false);
    if (result.success) {
      showGameToast('Joined Game', 'Connecting to partner...', 'success');
    } else {
      setError(result.error || 'Failed to join game');
    }
  };

  const handleCopyCode = () => {
    if (pairCode) {
      navigator.clipboard.writeText(pairCode);
      showGameToast('Copied!', 'Code copied to clipboard', 'success');
    }
  };

  const handleCopyLink = () => {
    if (pairCode) {
      const link = `${window.location.origin}?join=${pairCode}`;
      navigator.clipboard.writeText(link);
      showGameToast('Link Copied!', 'Share this link with your partner', 'success');
    }
  };

  const handleLeave = () => {
    if (confirm('Leave this game?')) {
      leaveGame();
      setView('main');
      setPlayerName('');
      setJoinCode('');
    }
  };

  // Already paired or waiting
  if (phase !== 'unpaired') {
    return (
      <div className="flex flex-col h-full p-4 space-y-4">
        <div className="apple-panel p-6">
          {isPaired ? (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-j-success/20 rounded-full flex items-center justify-center">
                <span className="text-3xl">🤝</span>
              </div>
              <h2 className="text-lg font-semibold text-j-text">
                Paired with {partnerName}
              </h2>
              <p className="text-j-secondary text-sm">
                {phase === 'selecting' ? 'Time to hide your squares!'
                  : phase === 'playing' ? 'Game in progress'
                  : 'Connected'}
              </p>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-j-accent/20 rounded-full flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-j-accent border-t-transparent rounded-full animate-spin" />
              </div>
              <h2 className="text-lg font-semibold text-j-text">Waiting for Partner</h2>
              <p className="text-j-secondary text-sm">Share the code below with your teammate</p>
            </div>
          )}
        </div>

        {isHost && pairCode && !isPaired && (
          <div className="apple-panel p-6 space-y-4">
            <div className="text-center">
              <p className="text-j-muted text-[10px] font-mono uppercase tracking-wider mb-2">Your Game Code</p>
              <div className="text-4xl font-mono font-bold text-j-accent tracking-widest">{pairCode}</div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopyCode}
                className="flex-1 px-4 py-2 bg-j-raised hover:bg-j-hover text-j-text rounded-lg transition-colors text-sm font-medium"
              >
                Copy Code
              </button>
              <button
                onClick={handleCopyLink}
                className="flex-1 px-4 py-2 bg-j-accent hover:bg-j-accent-hover text-j-bg rounded-lg transition-colors text-sm font-medium"
              >
                Copy Link
              </button>
            </div>
          </div>
        )}

        <div className="apple-panel p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-j-muted text-[10px] font-mono uppercase tracking-wider">Playing as</p>
              <p className="text-j-text font-medium">{odName}</p>
            </div>
            {pairCode && (
              <div className="text-right">
                <p className="text-j-muted text-[10px] font-mono uppercase tracking-wider">Room</p>
                <p className="text-j-accent font-mono">{pairCode}</p>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={handleLeave}
          className="px-4 py-2 text-j-error hover:text-j-error/80 hover:bg-j-error/10 rounded-lg transition-colors text-sm font-mono"
        >
          Leave Game
        </button>
      </div>
    );
  }

  // Main Menu
  if (view === 'main') {
    return (
      <div className="flex flex-col h-full p-4 space-y-4">
        <div className="apple-panel p-6 text-center">
          <h2 className="text-lg font-semibold text-j-text mb-2">Duo Mode</h2>
          <p className="text-j-secondary text-sm">Hide 5 squares, mark buzzwords, find your opponent's hidden spots.</p>
        </div>

        <button
          onClick={() => setView('create')}
          className="apple-panel p-6 text-left hover:bg-j-hover transition-colors group"
        >
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-j-accent/15 rounded-xl flex items-center justify-center group-hover:bg-j-accent/25 transition-colors">
              <span className="text-2xl">🎮</span>
            </div>
            <div>
              <h3 className="text-j-text font-medium">Create Game</h3>
              <p className="text-j-tertiary text-sm">Start a new game and invite a partner</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setView('join')}
          className="apple-panel p-6 text-left hover:bg-j-hover transition-colors group"
        >
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-j-me/15 rounded-xl flex items-center justify-center group-hover:bg-j-me/25 transition-colors">
              <span className="text-2xl">🤝</span>
            </div>
            <div>
              <h3 className="text-j-text font-medium">Join Game</h3>
              <p className="text-j-tertiary text-sm">Enter a code to join your partner</p>
            </div>
          </div>
        </button>
      </div>
    );
  }

  // Create Game Form
  if (view === 'create') {
    return (
      <div className="flex flex-col h-full p-4 space-y-4">
        <button
          onClick={() => { setView('main'); setError(null); }}
          className="flex items-center space-x-2 text-j-secondary hover:text-j-text transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm font-mono">Back</span>
        </button>

        <div className="apple-panel p-6 space-y-4">
          <h2 className="text-lg font-semibold text-j-text">Create Game</h2>
          <div>
            <label className="block text-j-tertiary text-xs font-mono uppercase tracking-wider mb-2">Your Name</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              className="apple-input w-full"
              maxLength={20}
              autoFocus
            />
          </div>
          {error && <p className="text-j-error text-sm">{error}</p>}
          <button
            onClick={handleCreateGame}
            disabled={isLoading}
            className="w-full px-4 py-3 bg-j-accent hover:bg-j-accent-hover disabled:opacity-50 text-j-bg rounded-lg transition-colors font-semibold"
          >
            {isLoading ? 'Creating...' : 'Create Game'}
          </button>
        </div>
      </div>
    );
  }

  // Join Game Form
  if (view === 'join') {
    return (
      <div className="flex flex-col h-full p-4 space-y-4">
        <button
          onClick={() => { setView('main'); setError(null); }}
          className="flex items-center space-x-2 text-j-secondary hover:text-j-text transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm font-mono">Back</span>
        </button>

        <div className="apple-panel p-6 space-y-4">
          <h2 className="text-lg font-semibold text-j-text">Join Game</h2>
          <div>
            <label className="block text-j-tertiary text-xs font-mono uppercase tracking-wider mb-2">Your Name</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              className="apple-input w-full"
              maxLength={20}
            />
          </div>
          <div>
            <label className="block text-j-tertiary text-xs font-mono uppercase tracking-wider mb-2">Game Code</label>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 4))}
              placeholder="XXXX"
              className="apple-input w-full font-mono text-center text-2xl tracking-widest uppercase"
              maxLength={4}
              autoFocus
            />
          </div>
          {error && <p className="text-j-error text-sm">{error}</p>}
          <button
            onClick={handleJoinGame}
            disabled={isLoading}
            className="w-full px-4 py-3 bg-j-accent hover:bg-j-accent-hover disabled:opacity-50 text-j-bg rounded-lg transition-colors font-semibold"
          >
            {isLoading ? 'Joining...' : 'Join Game'}
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export default RoomManager;
