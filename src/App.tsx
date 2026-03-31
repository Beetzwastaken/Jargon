import { useState, useEffect, lazy, Suspense } from 'react';
import { BingoCard } from './components/bingo/BingoCard';
import { BingoModal } from './components/bingo/BingoModal';
import { WelcomeTutorial } from './components/shared/WelcomeTutorial';
import { DuoScoreboard } from './components/bingo/DuoScoreboard';
import { LineSelector } from './components/bingo/LineSelector';
import { ModeSelector } from './components/ModeSelector';
import { SoloGame } from './components/SoloGame';
import { useDuoStore, regenerateDailyCardIfNeeded } from './stores/duoStore';
import { useConnectionStore } from './stores/connectionStore';
import { countMarkedInLine } from './lib/dailyCard';
import { APP_VERSION } from './utils/version';
import { ToastContainer, showGameToast } from './components/shared/ToastNotification';
import './App.css';

// Lazy load RoomManager
const RoomManager = lazy(() => import('./components/bingo/RoomManager').then(module => ({ default: module.RoomManager })));

function ComponentLoader() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="animate-spin w-6 h-6 border-2 border-apple-accent border-t-transparent rounded-full"></div>
    </div>
  );
}

function App() {
  const [mode, setMode] = useState<null | 'solo' | 'duo'>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showBingoModal, setShowBingoModal] = useState(false);
  const [lastBingoState, setLastBingoState] = useState({ myBingo: false, partnerBingo: false });

  // Duo store state
  const {
    phase,
    pairCode,
    odName,
    partnerName,
    isPaired,
    myLine,
    partnerLine,
    dailyCard,
    markedSquares,
    myScore,
    partnerScore,
    myBingo,
    partnerBingo,
    selectLine,
    markSquare,
    leaveGame,
    getMyLineIndices,
    getPartnerLineIndices
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
    }
  }, [mode]);

  // Watch for bingo events
  useEffect(() => {
    // Check if new bingo occurred
    if ((myBingo && !lastBingoState.myBingo) || (partnerBingo && !lastBingoState.partnerBingo)) {
      setShowBingoModal(true);
      setLastBingoState({ myBingo, partnerBingo });

      // Show toast
      if (myBingo && !lastBingoState.myBingo) {
        showGameToast('BINGO!', 'You completed your line!', 'success');
      } else if (partnerBingo && !lastBingoState.partnerBingo) {
        showGameToast('Partner BINGO!', `${partnerName} completed their line!`, 'success');
      }
    }
  }, [myBingo, partnerBingo, lastBingoState, partnerName]);

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
    if (selectedMode === 'duo' && joinCode) {
      // If join code exists, it will be handled in RoomManager
    }
  };

  const handleBackToModeSelect = () => {
    setMode(null);
    setJoinCode(null);
  };

  const handleSquareClick = async (squareId: string) => {
    if (phase !== 'playing') return;

    const squareIndex = parseInt(squareId.split('-')[1]);
    if (markedSquares[squareIndex]) return;

    await markSquare(squareIndex);
  };

  const handleLineSelect = async (line: { type: 'row' | 'col' | 'diag'; index: number }) => {
    const result = await selectLine(line);
    if (result.taken) {
      showGameToast('Line Taken', 'Your partner already picked that line. Choose another.', 'error');
    } else if (result.success) {
      showGameToast('Line Selected', 'Waiting for partner to pick...', 'success');
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

  // Determine bingo modal winner
  const getBingoWinner = (): 'me' | 'partner' | 'both' | undefined => {
    if (myBingo && partnerBingo) return 'both';
    if (myBingo) return 'me';
    if (partnerBingo) return 'partner';
    return undefined;
  };

  // Convert dailyCard to format BingoCard expects
  const boardSquares = dailyCard.map((square, index) => ({
    ...square,
    isMarked: markedSquares[index] || false
  }));

  // Show mode selector if no mode selected
  if (!mode) {
    return <ModeSelector onSelectMode={handleModeSelect} />;
  }

  // Show solo game
  if (mode === 'solo') {
    return <SoloGame onBack={handleBackToModeSelect} />;
  }

  // Render duo mode (original logic)
  return (
    <div className="h-screen bg-black text-white font-system flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-apple-dark border-b border-apple-border z-50 backdrop-blur-xl bg-opacity-80 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo + Back */}
            <div className="flex items-center space-x-3">
              {phase === 'unpaired' && (
                <button
                  onClick={handleBackToModeSelect}
                  className="p-2 -ml-2 text-apple-secondary hover:text-apple-text transition-colors"
                  title="Back"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}
              <div>
                <h1 className="text-lg font-medium text-apple-text">Jargon</h1>
                <span className="text-xs text-apple-tertiary">Duo Mode</span>
              </div>
            </div>

            {/* Center - Connection Status */}
            <div className="hidden md:flex items-center space-x-4">
              {phase !== 'unpaired' && (
                <>
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className="text-xs text-apple-secondary">
                      {isConnected ? 'Connected' : connectionError || 'Disconnected'}
                    </span>
                  </div>
                  {pairCode && (
                    <div className="px-3 py-1 bg-apple-darkest rounded-lg">
                      <span className="text-xs text-apple-tertiary">Room: </span>
                      <span className="font-mono text-cyan-400">{pairCode}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Right Controls */}
            <div className="flex items-center space-x-4">
              {phase !== 'unpaired' && (
                <button
                  onClick={toggleSidebar}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    sidebarOpen
                      ? 'bg-apple-accent text-white'
                      : 'text-apple-secondary hover:text-apple-text hover:bg-apple-hover'
                  }`}
                >
                  {sidebarOpen ? 'Close' : 'Game Info'}
                </button>
              )}

              {phase !== 'unpaired' && (
                <button
                  onClick={handleLeaveGame}
                  className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-md transition-colors"
                >
                  Leave
                </button>
              )}

              <button
                onClick={() => setShowTutorial(true)}
                className="p-2 text-apple-secondary hover:text-apple-text transition-colors"
                title="Show tutorial"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>

              <div className="text-xs text-apple-secondary font-mono">
                v{APP_VERSION}
              </div>
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
          <div className="max-w-2xl mx-auto">
            {/* Phase: Unpaired - Show RoomManager */}
            {phase === 'unpaired' && (
              <Suspense fallback={<ComponentLoader />}>
                <RoomManager />
              </Suspense>
            )}

            {/* Phase: Waiting - Show waiting screen with code */}
            {phase === 'waiting' && (
              <div className="text-center py-12">
                <div className="w-20 h-20 mx-auto mb-6 bg-apple-accent/20 rounded-full flex items-center justify-center">
                  <div className="w-10 h-10 border-3 border-apple-accent border-t-transparent rounded-full animate-spin"></div>
                </div>
                <h2 className="text-2xl font-semibold text-apple-text mb-2">Waiting for Partner</h2>
                <p className="text-apple-secondary mb-6">Share the code below with your teammate</p>

                <div className="inline-block p-6 bg-apple-darkest rounded-xl">
                  <p className="text-xs text-apple-tertiary uppercase tracking-wider mb-2">Your Game Code</p>
                  <div className="text-5xl font-mono font-bold text-cyan-400 tracking-widest">
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
                    className="px-4 py-2 bg-apple-darkest hover:bg-apple-hover text-apple-text rounded-lg transition-colors"
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
                    className="px-4 py-2 bg-apple-accent hover:bg-apple-accent-hover text-white rounded-lg transition-colors"
                  >
                    Copy Link
                  </button>
                </div>

                <p className="mt-6 text-apple-tertiary text-sm">
                  Playing as: <span className="text-apple-text">{odName}</span>
                </p>
              </div>
            )}

            {/* Phase: Selecting - Show LineSelector */}
            {phase === 'selecting' && (
              <div className="py-8">
                <LineSelector
                  onSelect={handleLineSelect}
                  selectedLine={myLine}
                  takenLine={partnerLine}
                  disabled={!!myLine}
                />

                {isPaired && (
                  <div className="mt-6 text-center text-apple-tertiary text-sm">
                    Playing with: <span className="text-apple-text">{partnerName}</span>
                  </div>
                )}
              </div>
            )}

            {/* Phase: Playing - Show BingoCard */}
            {phase === 'playing' && dailyCard.length > 0 && (
              <>
                {/* Today's Card header */}
                <div className="text-center mb-4">
                  <p className="text-sm text-apple-tertiary">
                    Today's Card • {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                  {myLine && (
                    <p className="text-xs text-cyan-400 mt-1">
                      Your line: {countMarkedInLine(markedSquares, myLine)}/5
                    </p>
                  )}
                </div>

                {/* Duo Scoreboard */}
                <div className="mb-6">
                  <DuoScoreboard />
                </div>

                {/* Bingo Card */}
                <BingoCard
                  squares={boardSquares}
                  onSquareClick={handleSquareClick}
                  hasBingo={myBingo || partnerBingo}
                  isDuoMode={true}
                  myLineIndices={getMyLineIndices()}
                  partnerLineIndices={getPartnerLineIndices()}
                  myScore={myScore}
                  partnerScore={partnerScore}
                />
              </>
            )}
          </div>
        </main>

        {/* Sidebar - Game Info */}
        {sidebarOpen && phase !== 'unpaired' && (
          <aside className="w-80 bg-apple-sidebar border-l border-apple-border overflow-auto fixed right-0 top-16 bottom-0 z-50 md:relative md:top-0">
            {/* Mobile Close */}
            <div className="md:hidden sticky top-0 bg-apple-sidebar border-b border-apple-border p-4 flex items-center justify-between">
              <h3 className="text-lg font-medium text-apple-text">Game Info</h3>
              <button onClick={closeSidebar} className="p-2 hover:bg-apple-hover rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Player Info */}
              <div className="apple-panel p-4">
                <h3 className="text-sm font-medium text-apple-secondary mb-3">Players</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-cyan-400">{odName || 'You'}</span>
                    <span className="text-cyan-400 font-bold">{myScore} pts</span>
                  </div>
                  {partnerName && (
                    <div className="flex items-center justify-between">
                      <span className="text-orange-400">{partnerName}</span>
                      <span className="text-orange-400 font-bold">{partnerScore} pts</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Scoring Rules */}
              <div className="apple-panel p-4">
                <h3 className="text-sm font-medium text-apple-secondary mb-3">Scoring</h3>
                <ul className="text-xs text-apple-tertiary space-y-1">
                  <li>+1 point per square in your line</li>
                  <li>+5 bonus for completing your line (BINGO)</li>
                  <li>New card at midnight in your timezone</li>
                </ul>
              </div>

              {/* Connection Status */}
              <div className="apple-panel p-4">
                <h3 className="text-sm font-medium text-apple-secondary mb-3">Connection</h3>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="text-xs text-apple-tertiary">
                    {isConnected ? 'Real-time sync active' : 'Reconnecting...'}
                  </span>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* BINGO Modal */}
      <BingoModal
        show={showBingoModal}
        onBingo={() => setShowBingoModal(false)}
        onCancel={() => setShowBingoModal(false)}
        board={dailyCard}
        markedSquares={markedSquares}
        score={myScore}
        gamesPlayed={1}
        isDuoMode={true}
        duoWinner={getBingoWinner()}
        myName={odName || 'You'}
        partnerName={partnerName || 'Partner'}
        myScore={myScore}
        partnerScore={partnerScore}
      />

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
