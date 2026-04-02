// API functions for Jargon - Duo Mode

import { getApiBaseUrl } from './config';
import type { LineSelection } from '../stores/duoStore';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Duo Mode API Responses
export interface DuoCreateResponse {
  success: boolean;
  code: string;
  playerId: string;
  playerName: string;
  dailySeed: string;
}

export interface DuoJoinResponse {
  success: boolean;
  playerId: string;
  playerName: string;
  partnerName: string;
  phase: 'waiting' | 'selecting' | 'playing' | 'finished';
  dailySeed: string;
  isHost: boolean;
}

export interface DuoSelectResponse {
  success: boolean;
  waiting?: boolean;
  phase?: string;
  error?: string;
}

export interface DuoMarkResponse {
  success: boolean;
  hit: boolean;
  myScore: number;
  partnerScore: number;
  gameOver: boolean;
  unmarked?: boolean;
}

export interface DuoSnapshotResponse {
  success: boolean;
  date: string;
  myLine: LineSelection | null;
  partnerLine: LineSelection | null;
  marks: Array<{ index: number; markedBy: string }>;
  myScore: number;
  partnerScore: number;
  winner: string | null;
}

// Generic API request handler
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  try {
    const baseUrl = getApiBaseUrl();
    const url = baseUrl ? `${baseUrl}${endpoint}` : endpoint;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      return {
        success: false,
        error: errorData.error || `Request failed with status ${response.status}`
      };
    }

    const data = await response.json();
    return {
      success: true,
      data
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error occurred'
    };
  }
}

// Create a duo game
export async function createDuoGame(playerName: string, timezone: string): Promise<ApiResponse<DuoCreateResponse>> {
  return apiRequest<DuoCreateResponse>('/api/duo/create', {
    method: 'POST',
    body: JSON.stringify({ playerName, timezone }),
  });
}

// Join a duo game
export async function joinDuoGame(code: string, playerName: string): Promise<ApiResponse<DuoJoinResponse>> {
  return apiRequest<DuoJoinResponse>('/api/duo/join', {
    method: 'POST',
    body: JSON.stringify({ code, playerName }),
  });
}

// Select a line
export async function selectLine(roomCode: string, playerId: string, line: LineSelection): Promise<ApiResponse<DuoSelectResponse>> {
  return apiRequest<DuoSelectResponse>(`/api/duo/${roomCode}/select`, {
    method: 'POST',
    headers: {
      'X-Player-ID': playerId
    },
    body: JSON.stringify({ line }),
  });
}

// Mark a square
export async function markSquare(roomCode: string, playerId: string, index: number): Promise<ApiResponse<DuoMarkResponse>> {
  return apiRequest<DuoMarkResponse>(`/api/duo/${roomCode}/mark`, {
    method: 'POST',
    headers: {
      'X-Player-ID': playerId
    },
    body: JSON.stringify({ index }),
  });
}

// Leave a game
export async function leaveDuoGame(roomCode: string, playerId: string): Promise<ApiResponse<{ success: boolean }>> {
  return apiRequest<{ success: boolean }>(`/api/duo/${roomCode}/leave`, {
    method: 'POST',
    headers: {
      'X-Player-ID': playerId
    },
  });
}

// Fetch yesterday's snapshot
export async function fetchSnapshot(roomCode: string, playerId: string): Promise<ApiResponse<DuoSnapshotResponse>> {
  return apiRequest<DuoSnapshotResponse>(`/api/duo/${roomCode}/snapshot`, {
    headers: {
      'X-Player-ID': playerId
    }
  });
}

// Health check
export async function checkHealth(): Promise<ApiResponse<{ status: string; version: string }>> {
  return apiRequest<{ status: string; version: string }>('/api/health');
}
