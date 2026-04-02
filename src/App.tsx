import { useState, useEffect, lazy, Suspense } from 'react';
import { BingoCard } from './components/bingo/BingoCard';
import { GameOverScreen } from './components/bingo/GameOverScreen';
import { WelcomeTutorial } from './components/shared/WelcomeTutorial';
import { DuoScoreboard } from './components/bingo/DuoScoreboard';
import { LineSelector } from './components/bingo/LineSelector';
import { ModeSelector } from './components/ModeSelector';
import { SoloGame } from './components/SoloGame';
import { useDuoStore, regenerateDailyCardIfNeeded } from './stores/duoStore';
import { useConnectionStore } from './stores/connectionStore';
import { ToastContainer, showGameToast } from './components/shared/ToastNotification';
import './App.css';

// Lazy load RoomManager
const RoomManager = lazy(() => import('./components/bingo/RoomManager').then(module => ({ default: module.RoomManager })));

function ComponentLoader() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="animate-spin w-6 h-6 border-2 border-j-accent border-t-transparent rounded-full"></div>
    </div>
  );
}

function App() {
  const [mode, setMode] = useState<null | 'solo' | 'duo'>(null);
  const [, setJoinCode] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Duo store state
  const {
    phase,
    pairCode,
    odId,
    odName,
    partnerName,
    isPaired,
    myLine,
    dailyCard,
    marks,
    myScore,
    partnerScore,
    isMyTurnToPick,
    partnerHasSelected,
    selectLine,
    markSquare,
    leaveGame,
    getMyLineIndices,
    getPartnerLineIndices,
    loadSnapshot,
  } = useDuoStore();

  // Connection state
  const { isConnected, connectionError } = useConnectionStore();

  // Parse URL for join code on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinParam = params.get('join');
    if (joinParam) {
      setJoinCode(joinParam);
      setMode('duo');
    }
  }, []);

  // Initialize on mount - regenerate card and reconnect if needed
  useEffect(() => {
    if (mode === 'duo') {
      regenerateDailyCardIfNeeded();
      // Load snapshot for yesterday's results
      loadSnapshot();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Check for first visit
  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem('jargon_tutorial_completed');
    if (!hasSeenTutorial) {
      setShowTutorial(true);
    }
  }, []);

  const handleTutorialComplete = () => {
    localStorage.setItem('jargon_tutorial_completed', 'true');
    setShowTutorial(false);
  };

  const handleModeSelect = (selectedMode: 'solo' | 'duo') => {
    setMode(selectedMode);
  };

  const handleBackToModeSelect = () => {
    setMode(null);
    setJoinCode(null);
  };

  const handleSquareClick = async (index: number) => {
    if (phase !== 'playing') return;
    await markSquare(index);
  };

  const handleLineSelect = async (line: { type: 'row' | 'col' | 'diag'; index: number }) => {
    const result = await selectLine(line);
    if (result.success) {
      showGameToast('Line Selected', 'Waiting for partner...', 'success');
    } else if (result.error) {
      showGameToast('Error', result.error, 'error');
    }
  };

  const handleLeaveGame = () => {
    if (confirm('Leave this game?')) {
      leaveGame();
      setSidebarOpen(false);
    }
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  // Convert dailyCard for BingoCard (keep isMarked false; marks array is source of truth)
  const boardSquares = dailyCard;

  // Show mode selector if no mode selected
  if (!mode) {
    return <ModeSelector onSelectMode={handleModeSelect} />;
  }

  // Show solo game
  if (mode === 'solo') {
    return <SoloGame onBack={handleBackToModeSelect} />;
  }

  // Render duo mode
  return (
    <div className="h-screen bg-j-bg text-j-text font-display flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-j-surface/80 border-b border-white/[0.06] z-50 backdrop-blur-xl flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Logo + Back */}
            <div className="flex items-center space-x-3">
              {phase === 'unpaired' && (
                <button
                  onClick={handleBackToModeSelect}
                  className="p-2 -ml-2 text-j-secondary hover:text-j-text transition-colors"
                  title="Back"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}
              <div>
                <h1 className="text-base font-semibold text-j-text tracking-tight">Jargon</h1>
                <span className="text-[10px] text-j-tertiary font-mono uppercase tracking-wider">Duo Mode</span>
              </div>
            </div>

            {/* Center - Connection Status */}
            <div className="hidden md:flex items-center space-x-4">
              {phase !== 'unpaired' && (
                <>
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-j-success' : 'bg-j-error'}`}></div>
                    <span className="text-[10px] text-j-secondary font-mono">
                      {isConnected ? 'Connected' : connectionError || 'Disconnected'}
                    </span>
                  </div>
                  {pairCode && (
                    <div className="px-2.5 py-1 bg-j-raised rounded-md border border-white/[0.06]">
                      <span className="font-mono text-xs text-j-accent">{pairCode}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Right Controls */}
            <div className="flex items-center space-x-3">
              {phase !== 'unpaired' && (
                <button
                  onClick={toggleSidebar}
                  className={`px-3 py-1.5 text-xs font-mono rounded-md transition-colors ${
                    sidebarOpen
                      ? 'bg-j-accent text-j-bg'
                      : 'text-j-secondary hover:text-j-text hover:bg-j-hover'
                  }`}
                >
                  {sidebarOpen ? 'Close' : 'Game Info'}
                </button>
              )}

              {phase !== 'unpaired' && (
                <button
                  onClick={handleLeaveGame}
                  className="px-3 py-1.5 text-xs font-mono text-j-error hover:text-j-error/80 hover:bg-j-error/10 rounded-md transition-colors"
                >
                  Leave
                </button>
              )}

              <button
                onClick={() => setShowTutorial(true)}
                className="p-2 text-j-secondary hover:text-j-text transition-colors"
                title="Show tutorial"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>

            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden min-h-0 relative">
        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
            onClick={closeSidebar}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-auto p-4">
          <div className="max-w-4xl mx-auto">
            {/* Phase: Unpaired - Show RoomManager */}
            {phase === 'unpaired' && (
              <Suspense fallback={<ComponentLoader />}>
                <RoomManager />
              </Suspense>
            )}

            {/* Phase: Waiting - Show waiting screen with code */}
            {phase === 'waiting' && (
              <div className="text-center py-12">
                <div className="w-20 h-20 mx-auto mb-6 bg-j-accent/20 rounded-full flex items-center justify-center">
                  <div className="w-10 h-10 border-3 border-j-accent border-t-transparent rounded-full animate-spin"></div>
                </div>
                <h2 className="text-2xl font-semibold text-j-text mb-2">Waiting for Partner</h2>
                <p className="text-j-secondary mb-6">Share the code below with your teammate</p>

                <div className="inline-block p-6 bg-j-raised rounded-xl">
                  <p className="text-xs text-j-tertiary uppercase tracking-wider mb-2">Your Game Code</p>
                  <div className="text-5xl font-mono font-bold text-j-me tracking-widest">
                    {pairCode}
                  </div>
                </div>

                <div className="mt-6 flex justify-center gap-3">
                  <button
                    onClick={() => {
                      if (pairCode) {
                        navigator.clipboard.writeText(pairCode);
                        showGameToast('Copied!', 'Code copied to clipboard', 'success');
                      }
                    }}
                    className="px-4 py-2 bg-j-raised hover:bg-j-hover text-j-text rounded-lg transition-colors"
                  >
                    Copy Code
                  </button>
                  <button
                    onClick={() => {
                      if (pairCode) {
                        const link = `${window.location.origin}?join=${pairCode}`;
                        navigator.clipboard.writeText(link);
                        showGameToast('Link Copied!', 'Share this link with your partner', 'success');
                      }
                    }}
                    className="px-4 py-2 bg-j-accent hover:bg-j-accent-hover text-white rounded-lg transition-colors"
                  >
                    Copy Link
                  </button>
                </div>

                <p className="mt-6 text-j-tertiary text-sm">
                  Playing as: <span className="text-j-text">{odName}</span>
                </p>
              </div>
            )}

            {/* Phase: Selecting - Show LineSelector */}
            {phase === 'selecting' && (
              <div className="py-8">
                <LineSelector
                  onSelect={handleLineSelect}
                  selectedLine={myLine}
                  isMyTurn={isMyTurnToPick}
                  partnerHasSelected={partnerHasSelected}
                  disabled={!!myLine}
                />

                {isPaired && (
                  <div className="mt-6 text-center text-j-tertiary text-sm">
                    Playing with: <span className="text-j-text">{partnerName}</span>
                  </div>
                )}
              </div>
            )}

            {/* Phase: Playing - Show BingoCard */}
            {phase === 'playing' && dailyCard.length > 0 && (
              <>
                {/* Today's Card header */}
                <div className="text-center mb-4">
                  <p className="text-sm text-j-tertiary">
                    Today's Card
                  </p>
                </div>

                {/* Duo Scoreboard */}
                <div className="mb-6">
                  <DuoScoreboard />
                </div>

                {/* Bingo Card */}
                <BingoCard
                  squares={boardSquares}
                  onSquareClick={handleSquareClick}
                  myPlayerId={odId || ''}
                  marks={marks}
                  myLineIndices={getMyLineIndices()}
                  phase="playing"
                />
              </>
            )}

            {/* Phase: Finished - Show GameOverScreen + Card */}
            {phase === 'finished' && (
              <>
                <GameOverScreen />

                {dailyCard.length > 0 && (
                  <div className="mt-8">
                    <BingoCard
                      squares={boardSquares}
                      onSquareClick={() => {}} // no-op in finished
                      myPlayerId={odId || ''}
                      marks={marks}
                      myLineIndices={getMyLineIndices()}
                      phase="finished"
                      partnerLineIndices={getPartnerLineIndices()}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </main>

        {/* Sidebar - Game Info */}
        {sidebarOpen && phase !== 'unpaired' && (
          <aside className="w-80 bg-j-surface border-l border-white/[0.06] overflow-auto fixed right-0 top-16 bottom-0 z-50 md:relative md:top-0">
            {/* Mobile Close */}
            <div className="md:hidden sticky top-0 bg-j-surface border-b border-white/[0.06] p-4 flex items-center justify-between">
              <h3 className="text-lg font-medium text-j-text">Game Info</h3>
              <button onClick={closeSidebar} className="p-2 hover:bg-j-hover rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Player Info */}
              <div className="apple-panel p-4">
                <h3 className="text-sm font-medium text-j-secondary mb-3">Players</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-j-me">{odName || 'You'}</span>
                    <span className="text-j-me font-bold">{myScore}/5</span>
                  </div>
                  {partnerName && (
                    <div className="flex items-center justify-between">
                      <span className="text-j-partner">{partnerName}</span>
                      <span className="text-j-partner font-bold">{partnerScore}/5</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Scoring Rules */}
              <div className="apple-panel p-4">
                <h3 className="text-sm font-medium text-j-secondary mb-3">Scoring</h3>
                <ul className="text-xs text-j-tertiary space-y-1">
                  <li>Your score = opponent's line squares you marked</li>
                  <li>5/5 = BINGO (early win)</li>
                  <li>New card at UTC midnight</li>
                </ul>
              </div>

              {/* Connection Status */}
              <div className="apple-panel p-4">
                <h3 className="text-sm font-medium text-j-secondary mb-3">Connection</h3>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-j-success' : 'bg-j-error'}`}></div>
                  <span className="text-xs text-j-tertiary">
                    {isConnected ? 'Real-time sync active' : 'Reconnecting...'}
                  </span>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Toast Notifications */}
      <ToastContainer />

      {/* Welcome Tutorial */}
      <WelcomeTutorial
        show={showTutorial}
        onComplete={handleTutorialComplete}
      />
    </div>
  );
}

export default App;
