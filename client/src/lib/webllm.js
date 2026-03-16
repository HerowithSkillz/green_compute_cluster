import { CreateMLCEngine } from '@mlc-ai/web-llm';
import { ENGINE_MODEL_ID } from './constants.js';

let engineInstance = null;
let loadingPromise = null;

/**
 * Get GPU adapter info for capability advertisement.
 */
export async function getGPUInfo() {
  if (!navigator.gpu) return null;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return null;
    const info = await adapter.requestAdapterInfo();
    return {
      vendor: info.vendor || 'unknown',
      architecture: info.architecture || 'unknown',
      description: info.description || info.device || 'WebGPU',
      maxBufferSize: adapter.limits?.maxBufferSize ?? 0,
    };
  } catch {
    return null;
  }
}

/**
 * Check if WebGPU is available.
 */
export function hasWebGPU() {
  return !!navigator.gpu;
}

/**
 * Lazily initialize the WebLLM engine. Returns the engine instance.
 * onProgress callback receives { progress, text } for UI updates.
 */
export async function getEngine(onProgress) {
  if (engineInstance) return engineInstance;

  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    console.log(`[WebLLM] Loading model: ${ENGINE_MODEL_ID}`);
    const engine = await CreateMLCEngine(ENGINE_MODEL_ID, {
      initProgressCallback: (report) => {
        onProgress?.({ progress: report.progress, text: report.text });
      },
    });
    engineInstance = engine;
    loadingPromise = null;
    console.log('[WebLLM] Model loaded.');
    return engine;
  })();

  return loadingPromise;
}

/**
 * Run a chat completion with streaming token callback.
 * @param {string} prompt - User prompt
 * @param {function} onToken - Called with each generated token string
 * @param {number} maxTokens - Max tokens to generate (default 512)
 * @returns {Promise<string>} Full generated text
 */
export async function generate(prompt, onToken, maxTokens = 512) {
  const engine = await getEngine();

  const chunks = await engine.chat.completions.create({
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    stream: true,
    temperature: 0.7,
  });

  let fullText = '';
  for await (const chunk of chunks) {
    const token = chunk.choices[0]?.delta?.content || '';
    if (token) {
      fullText += token;
      onToken?.(token);
    }
  }

  return fullText;
}

/**
 * Reset the engine (for cleanup or model swap).
 */
export async function resetEngine() {
  if (engineInstance) {
    await engineInstance.resetChat();
    engineInstance = null;
  }
}
