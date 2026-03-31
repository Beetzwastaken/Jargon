// Configuration for Jargon API endpoints

// API Configuration
export const API_CONFIG = {
  development: {
    baseUrl: 'http://localhost:8787',
    wsUrl: 'ws://localhost:8787'
  },
  production: {
    baseUrl: '', // Use relative URLs - Netlify will proxy to backend
    wsUrl: 'wss://api.playjargon.com'
  }
};

// Get current environment configuration
export function getApiConfig() {
  const isDevelopment = import.meta.env.DEV || window.location.hostname === 'localhost';
  return isDevelopment ? API_CONFIG.development : API_CONFIG.production;
}

// Get API base URL
export function getApiBaseUrl(): string {
  return getApiConfig().baseUrl;
}

// Get WebSocket URL
export function getWebSocketBaseUrl(): string {
  return getApiConfig().wsUrl;
}

// Environment detection
export const isDevelopment = import.meta.env.DEV;
export const isProduction = import.meta.env.PROD;

// Feature flags
export const FEATURES = {
  enableWebSockets: true,
  enableAnalytics: true,
  enableDevTools: isDevelopment,
  maxRoomSize: 10,
  maxReconnectAttempts: 5,
  reconnectDelay: 1000
} as const;

export default {
  API_CONFIG,
  getApiConfig,
  getApiBaseUrl,
  getWebSocketBaseUrl,
  isDevelopment,
  isProduction,
  FEATURES
};