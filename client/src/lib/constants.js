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
export const SIGNAL_URL = import.meta.env.VITE_SIGNAL_URL || 'ws://localhost:3001';
export const DEFAULT_ROOM = import.meta.env.VITE_DEFAULT_ROOM || 'hackathon-demo';
export const ENGINE_MODEL_ID = import.meta.env.VITE_ENGINE_MODEL || 'Llama-3.2-3B-Instruct-q4f16_1-MLC';

// Timeouts
export const HEARTBEAT_INTERVAL_MS = 5000;
export const TASK_TIMEOUT_MS = 30000;
