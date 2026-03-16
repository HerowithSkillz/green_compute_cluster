// Message type enum for DataChannel communication
export const MSG = {
  // Control plane
  PEER_CAPS:     'PEER_CAPS',
  HEARTBEAT:     'HEARTBEAT',
  HEARTBEAT_ACK: 'HEARTBEAT_ACK',

  // Agentic Swarm
  TASK_ASSIGN:   'TASK_ASSIGN',
  TASK_RESULT:   'TASK_RESULT',
  TASK_DONE:     'TASK_DONE',
  TASK_REJECT:   'TASK_REJECT',

  // Inference streaming
  INFER_REQUEST: 'INFER_REQUEST',
  INFER_TOKEN:   'INFER_TOKEN',
  INFER_DONE:    'INFER_DONE',
  INFER_ERROR:   'INFER_ERROR',
};

const MAX_CHUNK_SIZE = 16 * 1024; // 16KB

/**
 * Encode a typed message into a JSON string for DataChannel transport.
 */
export function encodeMessage(type, payload) {
  return JSON.stringify({ type, payload, ts: Date.now() });
}

/**
 * Decode a DataChannel message string back into { type, payload, ts }.
 */
export function decodeMessage(data) {
  try {
    const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * Chunk an ArrayBuffer for large transfers (e.g., KV-cache prefill).
 */
export function chunkArrayBuffer(buffer, taskId) {
  const chunks = [];
  const total = Math.ceil(buffer.byteLength / MAX_CHUNK_SIZE);
  for (let i = 0; i < total; i++) {
    const chunk = buffer.slice(i * MAX_CHUNK_SIZE, (i + 1) * MAX_CHUNK_SIZE);
    chunks.push({ taskId, chunkIndex: i, totalChunks: total, data: chunk });
  }
  return chunks;
}

/**
 * Decompose a prompt into parallelizable sub-prompts for swarm dispatch.
 */
export function decomposePrompt(prompt, peerCount) {
  const strategies = [
    // Strategy 1: Multi-question (detect '?' delimiters)
    () => prompt.split('?').filter(Boolean).map(q => q.trim() + '?'),
    // Strategy 2: Explicit numbered list
    () => prompt.match(/\d+\.\s+.+?(?=\d+\.|$)/gs)?.map(s => s.trim()),
    // Strategy 3: Sentence chunking (fallback)
    () => {
      const sentences = prompt.match(/[^.!?]+[.!?]+/g) || [prompt];
      const chunkSize = Math.ceil(sentences.length / peerCount);
      const chunks = [];
      for (let i = 0; i < sentences.length; i += chunkSize) {
        chunks.push(sentences.slice(i, i + chunkSize).join(' '));
      }
      return chunks;
    },
  ];

  for (const strategy of strategies) {
    const result = strategy();
    if (result && result.length > 1 && result.length <= peerCount + 1) {
      return result;
    }
  }
  return [prompt]; // No decomposition — run locally
}
