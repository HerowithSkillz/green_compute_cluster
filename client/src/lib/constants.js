// ICE server configuration for WebRTC
export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// DataChannel configs
export const INFERENCE_CHANNEL_CONFIG = {
  label: 'inference',
  ordered: false,
  maxRetransmits: 0,
};

export const CONTROL_CHANNEL_CONFIG = {
  label: 'control',
  ordered: true,
};

// Signal server URL
// - In production, we usually reverse-proxy Socket.IO on the same origin (recommended),
//   so default to the current site origin.
// - In dev, default to the local signaling server.
// You can always override with VITE_SIGNAL_URL.
export const SIGNAL_URL = (() => {
  const envUrl = import.meta.env.VITE_SIGNAL_URL;
  if (envUrl) return envUrl;

  // Vite injects DEV/PROD flags at build time.
  if (import.meta.env.DEV) return 'http://localhost:3001';

  return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';
})();
export const DEFAULT_ROOM = import.meta.env.VITE_DEFAULT_ROOM || 'hackathon-demo';
export const ENGINE_MODEL_ID = import.meta.env.VITE_ENGINE_MODEL || 'Llama-3.2-3B-Instruct-q4f16_1-MLC';

// Timeouts
export const HEARTBEAT_INTERVAL_MS = 5000;
export const TASK_TIMEOUT_MS = 30000;
