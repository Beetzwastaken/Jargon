// Connection Store - Manages WebSocket and HTTP polling for Duo Mode
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { BingoWebSocketClient, DUO_MESSAGE_TYPES } from '../lib/websocket';
import type { DuoWebSocketMessage } from '../lib/websocket';
import { BingoPollingClient } from '../lib/polling';
import type { DuoStateUpdate } from '../lib/polling';
import { useDuoStore } from './duoStore';
import { generateDailyCard } from '../lib/dailyCard';

interface ConnectionStore {
  // State
  isConnected: boolean;
  connectionError: string | null;
  wsClient: BingoWebSocketClient | null;
  pollingClient: BingoPollingClient | null;
  usePolling: boolean;

  // Actions
  connect: (roomCode: string, playerId: string) => Promise<void>;
  disconnect: () => void;
  setConnectionError: (error: string | null) => void;
  switchToPolling: () => void;
}

export const useConnectionStore = create<ConnectionStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      isConnected: false,
      connectionError: null,
      wsClient: null,
      pollingClient: null,
      usePolling: false,

      // Connect to duo room
      connect: async (roomCode: string, playerId: string) => {
        const state = get();

        // Disconnect existing connections
        if (state.wsClient) {
          state.wsClient.disconnect();
        }
        if (state.pollingClient) {
          state.pollingClient.stopPolling();
        }

        // Create WebSocket client
        const wsClient = new BingoWebSocketClient({
          roomCode,
          playerId,
          onMessage: handleWebSocketMessage,
          onConnect: () => {
            set({ isConnected: true, connectionError: null });
          },
          onDisconnect: () => {
            set({ isConnected: false });

            // Switch to polling as fallback
            const currentState = get();
            if (!currentState.usePolling) {
              currentState.switchToPolling();
            }
          },
          onError: (error) => {
            set({ connectionError: error.message });

            // Switch to polling on error
            const currentState = get();
            if (!currentState.usePolling) {
              currentState.switchToPolling();
            }
          }
        });

        set({ wsClient });

        try {
          await wsClient.connect();
        } catch {
          get().switchToPolling();
        }
      },

      // Disconnect from room
      disconnect: () => {
        const state = get();

        if (state.wsClient) {
          state.wsClient.disconnect();
        }

        if (state.pollingClient) {
          state.pollingClient.stopPolling();
        }

        set({
          wsClient: null,
          pollingClient: null,
          isConnected: false,
          connectionError: null,
          usePolling: false
        });
      },

      // Set connection error
      setConnectionError: (error: string | null) => {
        set({ connectionError: error });
      },

      // Switch to HTTP polling
      switchToPolling: () => {
        const duoState = useDuoStore.getState();

        if (!duoState.pairCode || !duoState.odId) {
          return;
        }

        const pollingClient = new BingoPollingClient({
          roomCode: duoState.pairCode,
          playerId: duoState.odId,
          onUpdate: handlePollingUpdate,
          onError: (error) => {
            set({ connectionError: error.message });
          },
          pollInterval: 2000
        });

        pollingClient.startPolling();

        set({
          pollingClient,
          usePolling: true,
          isConnected: true // Polling counts as "connected"
        });
      }
    })
  )
);

// Handle WebSocket messages from server
function handleWebSocketMessage(message: DuoWebSocketMessage): void {
  const duoStore = useDuoStore.getState();

  switch (message.type) {
    case DUO_MESSAGE_TYPES.CONNECTED:
      break;

    case DUO_MESSAGE_TYPES.PARTNER_JOINED:
      if (message.partnerId && message.partnerName) {
        duoStore.handlePartnerJoined({
          id: message.partnerId,
          name: message.partnerName
        });
      }
      break;

    case DUO_MESSAGE_TYPES.PARTNER_LEFT: {
      const ds = useDuoStore.getState();
      // If the host left, room is destroyed — fully reset the partner
      const hostLeft = ds.isHost === false;
      duoStore.handlePartnerLeft(hostLeft);
      break;
    }

    case DUO_MESSAGE_TYPES.PARTNER_READY:
      duoStore.handlePartnerReady();
      break;

    case DUO_MESSAGE_TYPES.BOTH_SELECTED:
      duoStore.handleBothSelected();
      break;

    case DUO_MESSAGE_TYPES.SQUARE_MARKED:
      if (typeof message.index === 'number' && message.markedBy) {
        const ds = useDuoStore.getState();
        const isHost = ds.isHost;
        const myHits = isHost ? (message.hostHits ?? ds.myHits) : (message.partnerHits ?? ds.myHits);
        const partnerHits = isHost ? (message.partnerHits ?? ds.partnerHits) : (message.hostHits ?? ds.partnerHits);
        duoStore.handleSquareMarked(message.index, message.markedBy, !!message.isHit, myHits, partnerHits);
      }
      break;

    case DUO_MESSAGE_TYPES.SQUARE_UNMARKED:
      if (typeof message.index === 'number') {
        const ds = useDuoStore.getState();
        const isHost = ds.isHost;
        const myHits = isHost ? (message.hostHits ?? ds.myHits) : (message.partnerHits ?? ds.myHits);
        const partnerHits = isHost ? (message.partnerHits ?? ds.partnerHits) : (message.hostHits ?? ds.partnerHits);
        duoStore.handleSquareUnmarked(message.index, message.markedBy, myHits, partnerHits);
      }
      break;

    case DUO_MESSAGE_TYPES.GAME_OVER:
      if (message.winner && message.hostSquares && message.partnerSquares) {
        const ds = useDuoStore.getState();
        const isHost = ds.isHost;
        const myHits = isHost ? (message.hostHits ?? ds.myHits) : (message.partnerHits ?? ds.myHits);
        const partnerHits = isHost ? (message.partnerHits ?? ds.partnerHits) : (message.hostHits ?? ds.partnerHits);
        const myMarks = isHost ? (message.hostMarks ?? 0) : (message.partnerMarks ?? 0);
        const partnerMarks = isHost ? (message.partnerMarks ?? 0) : (message.hostMarks ?? 0);
        duoStore.handleGameOver(message.winner, myHits, partnerHits, myMarks, partnerMarks, message.hostSquares, message.partnerSquares, message.allHit);
      }
      break;

    case DUO_MESSAGE_TYPES.DAILY_RESET:
      if (message.newSeed) {
        duoStore.handleDailyReset(message.newSeed);
      }
      break;

    default:
  }
}

// Handle polling state updates
function handlePollingUpdate(state: DuoStateUpdate): void {
  const duoState = useDuoStore.getState();

  // Update pairing state
  if (state.isPaired && !duoState.isPaired && state.partnerName) {
    useDuoStore.setState({
      partnerName: state.partnerName,
      isPaired: true
    });
  }

  // Update phase
  if (state.phase !== duoState.phase) {
    const updates: Record<string, unknown> = { phase: state.phase };

    // If transitioning to playing, generate card
    if (state.phase === 'playing' && duoState.dailyCard.length === 0) {
      const seed = state.dailySeed || duoState.dailySeed;
      if (seed) {
        updates.dailyCard = generateDailyCard(seed);
      }
    }

    useDuoStore.setState(updates);
  }

  // Update selection state
  if (state.phase === 'selecting') {
    useDuoStore.setState({
      myReady: state.myReady ?? false,
      partnerReady: state.partnerReady ?? false,
    });
  }

  // Update playing/finished state
  if (state.phase === 'playing' || state.phase === 'finished') {
    const updates: Record<string, unknown> = {};

    if (state.marks) {
      updates.marks = state.marks;
    }
    if (typeof state.myHits === 'number') {
      updates.myHits = state.myHits;
    }
    if (typeof state.partnerHits === 'number') {
      updates.partnerHits = state.partnerHits;
    }
    if (state.mySquares) {
      updates.mySquares = state.mySquares;
    }

    // Finished-only fields
    if (state.phase === 'finished') {
      if (state.winner) {
        const isHost = state.isHost;
        let winnerValue: 'me' | 'partner' | 'tie' | null = null;
        if (state.winner === 'tie') winnerValue = 'tie';
        else if ((state.winner === 'host' && isHost) || (state.winner === 'partner' && !isHost)) winnerValue = 'me';
        else winnerValue = 'partner';
        updates.winner = winnerValue;
        updates.gameOver = true;
      }
      if (state.partnerSquares) {
        updates.partnerSquares = state.partnerSquares;
      }
    }

    // Generate card if needed
    if (state.card && duoState.dailyCard.length === 0) {
      updates.dailyCard = state.card.map((text: string, index: number) => ({
        id: `square-${index}`,
        text,
        isMarked: false
      }));
    }

    useDuoStore.setState(updates);
  }

  // Check for daily reset
  if (state.dailySeed !== duoState.dailySeed) {
    useDuoStore.setState({ dailySeed: state.dailySeed });
    if (duoState.dailySeed && state.dailySeed !== duoState.dailySeed) {
      useDuoStore.getState().handleDailyReset(state.dailySeed);
    }
  }
}
