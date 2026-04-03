// WebSocket service for Duo Mode real-time communication
// Handles connections to Cloudflare Workers Durable Objects

import { getWebSocketBaseUrl } from './config';

// Message types from server
export interface DuoWebSocketMessage {
  type: string;
  // Partner joined
  partnerId?: string;
  partnerName?: string;
  // Square marked/unmarked
  index?: number;
  markedBy?: string;
  hostScore?: number;
  partnerScore?: number;
  // Game over
  winner?: string;
  hostLine?: { type: 'row' | 'col' | 'diag'; index: number };
  partnerLine?: { type: 'row' | 'col' | 'diag'; index: number };
  bonusBingo?: boolean;
  // Daily reset
  newSeed?: string;
  // Connection state
  phase?: string;
  isHost?: boolean;
  hostName?: string;
  isPaired?: boolean;
  isMyTurnToPick?: boolean;
}

interface ConnectionOptions {
  roomCode: string;
  playerId: string;
  onMessage: (message: DuoWebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export class BingoWebSocketClient {
  private socket: WebSocket | null = null;
  private options: ConnectionOptions;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;
  private pingInterval: number | null = null;

  constructor(options: ConnectionOptions) {
    this.options = options;
  }

  // Get WebSocket URL for duo mode
  private getWebSocketUrl(): string {
    const { roomCode, playerId } = this.options;
    const baseUrl = getWebSocketBaseUrl();
    return `${baseUrl}/api/duo/${roomCode}/ws?playerId=${playerId}`;
  }

  // Connect to WebSocket
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnecting) {
        reject(new Error('Connection already in progress'));
        return;
      }

      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.isConnecting = true;

      try {
        const url = this.getWebSocketUrl();
        this.socket = new WebSocket(url);

        const timeout = setTimeout(() => {
          if (this.socket?.readyState !== WebSocket.OPEN) {
            this.socket?.close();
            reject(new Error('Connection timeout'));
          }
        }, 10000);

        this.socket.onopen = () => {
          clearTimeout(timeout);
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.startPing();
          this.options.onConnect?.();
          resolve();
        };

        this.socket.onmessage = (event) => {
          try {
            const message: DuoWebSocketMessage = JSON.parse(event.data);
            // Handle pong silently
            if (message.type === 'pong') return;
            this.options.onMessage(message);
          } catch {
            // Silently ignore parse errors
          }
        };

        this.socket.onclose = (event) => {
          clearTimeout(timeout);
          this.isConnecting = false;
          this.stopPing();
          this.options.onDisconnect?.();

          // Auto-reconnect unless manual close
          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        };

        this.socket.onerror = () => {
          clearTimeout(timeout);
          this.isConnecting = false;
          const error = new Error('WebSocket connection error');
          this.options.onError?.(error);

          if (this.socket?.readyState !== WebSocket.OPEN) {
            reject(error);
          }
        };
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  // Start ping interval for keepalive
  private startPing(): void {
    this.pingInterval = window.setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // Ping every 30 seconds
  }

  // Stop ping interval
  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // Schedule reconnect with exponential backoff
  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    setTimeout(() => {
      if (this.reconnectAttempts <= this.maxReconnectAttempts) {
        this.connect().catch(() => {
          // Silently ignore reconnection errors
        });
      } else {
        this.options.onError?.(new Error('Max reconnection attempts reached'));
      }
    }, delay);
  }

  // Send message to server
  send(type: string, payload?: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      try {
        this.socket.send(JSON.stringify({ type, ...payload }));
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  // Check connection status
  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  // Disconnect gracefully
  disconnect(): void {
    this.stopPing();
    if (this.socket) {
      this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-reconnect
      this.socket.close(1000, 'Manual disconnect');
      this.socket = null;
    }
  }

  // Update connection options
  updateOptions(newOptions: Partial<ConnectionOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }
}

// Create WebSocket client
export function createWebSocketClient(options: ConnectionOptions): BingoWebSocketClient {
  return new BingoWebSocketClient(options);
}

// Message type constants for duo mode
export const DUO_MESSAGE_TYPES = {
  // Connection
  CONNECTED: 'connected',
  PING: 'ping',
  PONG: 'pong',

  // Pairing
  PARTNER_JOINED: 'partner_joined',
  PARTNER_LEFT: 'partner_left',

  // Line selection
  YOUR_TURN_TO_PICK: 'your_turn_to_pick',
  BOTH_SELECTED: 'both_selected',

  // Gameplay
  SQUARE_MARKED: 'square_marked',
  SQUARE_UNMARKED: 'square_unmarked',
  GAME_OVER: 'game_over',

  // Daily
  DAILY_RESET: 'daily_reset'
} as const;
