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
      // Set turn info if present
      if (typeof message.isMyTurnToPick === 'boolean') {
        useDuoStore.setState({ isMyTurnToPick: message.isMyTurnToPick });
      }
      break;

    case DUO_MESSAGE_TYPES.PARTNER_JOINED:
      if (message.partnerId && message.partnerName) {
        duoStore.handlePartnerJoined({
          id: message.partnerId,
          name: message.partnerName
        });
        if (typeof message.isMyTurnToPick === 'boolean') {
          useDuoStore.setState({ isMyTurnToPick: message.isMyTurnToPick });
        }
      }
      break;

    case DUO_MESSAGE_TYPES.PARTNER_LEFT: {
      const ds = useDuoStore.getState();
      // If the host left, room is destroyed — fully reset the partner
      const hostLeft = ds.isHost === false;
      duoStore.handlePartnerLeft(hostLeft);
      break;
    }

    case DUO_MESSAGE_TYPES.YOUR_TURN_TO_PICK:
      duoStore.handleYourTurnToPick();
      break;

    case DUO_MESSAGE_TYPES.BOTH_SELECTED:
      duoStore.handleBothSelected();
      break;

    case DUO_MESSAGE_TYPES.SQUARE_MARKED:
      if (typeof message.index === 'number' && message.markedBy) {
        const ds = useDuoStore.getState();
        const isHost = ds.isHost;
        const myScore = isHost ? (message.hostScore ?? ds.myScore) : (message.partnerScore ?? ds.myScore);
        const partnerScore = isHost ? (message.partnerScore ?? ds.partnerScore) : (message.hostScore ?? ds.partnerScore);
        duoStore.handleSquareMarked(message.index, message.markedBy, myScore, partnerScore);
      }
      break;

    case DUO_MESSAGE_TYPES.SQUARE_UNMARKED:
      if (typeof message.index === 'number') {
        const ds = useDuoStore.getState();
        const isHost = ds.isHost;
        const myScore = isHost ? (message.hostScore ?? ds.myScore) : (message.partnerScore ?? ds.myScore);
        const partnerScore = isHost ? (message.partnerScore ?? ds.partnerScore) : (message.hostScore ?? ds.partnerScore);
        duoStore.handleSquareUnmarked(message.index, message.markedBy, myScore, partnerScore);
      }
      break;

    case DUO_MESSAGE_TYPES.GAME_OVER:
      if (message.winner && message.hostLine && message.partnerLine) {
        const ds = useDuoStore.getState();
        const isHost = ds.isHost;
        const myScore = isHost ? (message.hostScore ?? ds.myScore) : (message.partnerScore ?? ds.myScore);
        const partnerScore = isHost ? (message.partnerScore ?? ds.partnerScore) : (message.hostScore ?? ds.partnerScore);
        duoStore.handleGameOver(message.winner, myScore, partnerScore, message.hostLine, message.partnerLine);
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
      isMyTurnToPick: state.isMyTurnToPick ?? false,
      partnerHasSelected: state.partnerHasSelected ?? false,
    });
  }

  // Update playing/finished state
  if (state.phase === 'playing' || state.phase === 'finished') {
    const updates: Record<string, unknown> = {};

    if (state.marks) {
      updates.marks = state.marks;
    }
    if (typeof state.myScore === 'number') {
      updates.myScore = state.myScore;
    }
    if (typeof state.partnerScore === 'number') {
      updates.partnerScore = state.partnerScore;
    }
    if (state.myLine) {
      updates.myLine = state.myLine;
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
      if (state.partnerLine) {
        updates.partnerLine = state.partnerLine;
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
