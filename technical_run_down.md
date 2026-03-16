# Technical Run-Down — Green Compute Cluster

> IndiaNext 2026 | `green_compute_cluster` | Branch: `new_feature`
> Last updated: 2026-03-17

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Directory Structure](#4-directory-structure)
5. [Server Layer](#5-server-layer)
6. [Client Layer — Hooks](#6-client-layer--hooks)
7. [Client Layer — Libraries](#7-client-layer--libraries)
8. [Client Layer — Components](#8-client-layer--components)
9. [Data Flow: Full Lifecycle](#9-data-flow-full-lifecycle)
10. [WebRTC Handshake & Perfect Negotiation](#10-webrtc-handshake--perfect-negotiation)
11. [Agentic Swarm Protocol](#11-agentic-swarm-protocol)
12. [Role System](#12-role-system)
13. [Deployment Architecture](#13-deployment-architecture)
14. [Known Gaps & Gotchas](#14-known-gaps--gotchas)
15. [Feasibility: Distributed Video Rendering](#15-feasibility-distributed-video-rendering)

---

## 1. Project Overview

**Green Compute Cluster** pools idle laptop compute (CPU/GPU) directly in the browser to run large language model (LLM) inference — all at zero infrastructure cost. Instead of paying for cloud GPU instances, willing participants donate their device's WebGPU horsepower, forming a P2P mesh. Any receiver on the network can send a prompt and get distributed inference back.

**Core insight:** Every laptop in a hackathon room or office has > 6 GB VRAM sitting idle. WebGPU lets you run quantized LLMs (Llama-3.2-3B at q4f16) at ~25–40 tokens/second in-browser. The missing piece is coordination — which is what this project provides.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BROWSER (Peer A — Donor)                     │
│                                                                     │
│  React SPA ───► useSignaling (Socket.IO) ──► Signaling Server       │
│       │                                        (DO Droplet)         │
│       │         useWebRTC (RTCPeerConnection)                        │
│       │              ├── DataChannel: "inference" (UDP-like)         │
│       │              └── DataChannel: "control"   (reliable)        │
│       │                                                             │
│       └────► useAgenticSwarm ───► webllm.js ───► WebGPU (Llama-3.2) │
└─────────────────────────────────────────────────────────────────────┘
                              ▲  ▼  (WebRTC DataChannel — P2P, TLS)
┌─────────────────────────────────────────────────────────────────────┐
│                        BROWSER (Peer B — Receiver)                  │
│                                                                     │
│  React SPA ───► useSignaling (Socket.IO) ──► Signaling Server       │
│       │                                                             │
│       └────► InferenceTerminal ◄──── INFER_TOKEN stream             │
└─────────────────────────────────────────────────────────────────────┘
```

**Two network layers:**

| Layer | Transport | Purpose |
|---|---|---|
| Signaling | Socket.IO over WebSocket (TLS) | Peer discovery, SDP/ICE relay only |
| Data | WebRTC DataChannel (DTLS/SCTP, P2P) | All inference tokens, task assignment, heartbeats |

After the WebRTC connection is established the signaling server is no longer in the hot path. All LLM output travels peer-to-peer.

---

## 3. Technology Stack

| Layer | Technology | Version | Rationale |
|---|---|---|---|
| Frontend framework | React | ^18.3.1 | Hooks-first; concurrent mode for streaming |
| Build tool | Vite | ^5.4.0 | Native ESM, <500ms HMR |
| LLM runtime | @mlc-ai/web-llm | ^0.2.78 | WebGPU quantized LLM, OPFS caching |
| Default model | Llama-3.2-3B-Instruct-q4f16\_1-MLC | — | ~2 GB VRAM, 25–40 tok/s on mid-range GPU |
| Demo model | Qwen2.5-0.5B-Instruct-q4f16\_1-MLC | — | Faster loads for demo environments |
| P2P transport | WebRTC DataChannel | browser-native | True P2P, DTLS-encrypted, no relay cost |
| Signaling | Socket.IO | ^4.7.5 (client + server) | Tested at exact same semver; no drift |
| 3D globe | Three.js | ^0.160.0 | WebGL2 point-cloud earth rendering |
| HTTP server | Express | ^4.19.2 | Thin signaling-only server |
| Reverse proxy | Caddy v2 | — | Automatic HTTPS, SPA fallback |
| Hosting | DigitalOcean Droplet | — | Static IP, sub-$10/mo |
| Language | ES Modules (ESM) | — | Both client and server use `"type":"module"` |

**Browser requirement:** Chrome 113+ (WebGPU). Firefox/Safari not supported for LLM inference (they can still participate as receivers over DataChannel).

---

## 4. Directory Structure

```
green_compute_cluster/
├── TECHNICAL_BLUEPRINT.md        Original build spec (784 lines)
├── technical_run_down.md         This file
├── README.md                     Stub
├── .env                          Live dev config (git-ignored)
├── .env.example                  Template for new contributors
├── .gitignore
│
├── client/                       Vite + React SPA
│   ├── index.html
│   ├── vite.config.js            Dev proxy: /socket.io → :3001
│   ├── package.json
│   └── src/
│       ├── main.jsx              ReactDOM.createRoot (no StrictMode)
│       ├── App.jsx               Root: state, hook wiring, message dispatch
│       ├── hooks/
│       │   ├── useSignaling.js   Socket.IO lifecycle + peer registry
│       │   ├── useWebRTC.js      RTCPeerConnection + DataChannels
│       │   └── useAgenticSwarm.js  Task decomposition + distributed routing
│       ├── components/
│       │   ├── ClusterDashboard.jsx  Stats bar + NodeCard grid
│       │   ├── InferenceTerminal.jsx  Token stream output + chat input
│       │   ├── NodeCard.jsx           Per-peer status card
│       │   ├── SwarmLog.jsx           Swarm activity log panel
│       │   ├── DonorDashboard.jsx     Full-width donor view
│       │   ├── EarthHologramGlobe.jsx Three.js land-point-cloud globe
│       │   ├── HolographicGlobe.jsx   SVG fallback wireframe globe
│       │   └── NeonEarthGlobe.jsx     Image-based globe (unused in main flow)
│       ├── lib/
│       │   ├── constants.js      ICE servers, channel configs, env vars
│       │   ├── protocol.js       MSG enum, encode/decode, chunking, decompose
│       │   └── webllm.js         WebLLM singleton, generate(), getEngine()
│       └── styles/
│           └── index.css         1,166-line dark theme with CSS variables
│
├── server/
│   ├── package.json
│   ├── index.js                  Express + Socket.IO signaling relay
│   └── rooms.js                  RoomManager — in-memory Map
│
└── caddy/
    └── Caddyfile                 TLS + SPA routing + reverse proxy config
```

---

## 5. Server Layer

### `server/index.js` — Signaling Server

The server is a **pure relay**. It never inspects SDP bodies or ICE candidates. Its only jobs are:

1. **Room membership** — track who is in which room via `RoomManager`
2. **Signal relay** — forward `{ type, sdp }` / `{ candidate }` payloads between named peers
3. **Presence events** — broadcast `peer-joined` / `peer-left` to room members

**Socket events handled:**

| Event (inbound) | Action |
|---|---|
| `join-room` | Register peer in `RoomManager`; emit `room-peers` to joiner; broadcast `peer-joined` to room |
| `signal` | Look up target peer's `socketId`; forward payload to target socket only |
| `disconnect` | Remove peer from room; broadcast `peer-left` |

**Data stored per peer (in-memory):**
```js
{
  socketId: string,   // Socket.IO internal socket ID for routing
  gpuCapable: bool,   // self-reported WebGPU capability
  role: 'donor' | 'receiver',
  username: string,   // sanitized: trim + max 32 chars
  joinedAt: number,   // epoch ms
}
```

**CORS:** Configurable via `CLIENT_ORIGIN` env var. Defaults to `'*'` for dev. Pinned to `{ transports: ['websocket'] }` — polling is disabled to prevent sticky-session issues on DO.

**Health check:** `GET /health` returns `{ status: 'ok', rooms: N }` — used by Caddy and monitoring.

### `server/rooms.js` — RoomManager

```
RoomManager
  #rooms: Map<roomId, Map<peerId, PeerMeta>>

  join(roomId, peerId, socketId, gpuCapable, role, username) → PeerMeta[]
    Returns snapshot of existing peers BEFORE adding the new one.
    Room auto-created on first join.

  leave(roomId, peerId)
    Room auto-deleted when empty.

  getSocketId(roomId, peerId) → string | null
    Used by signal relay to find the target socket.

  size() → number
    Count of active rooms.
```

Uses JS private class fields (`#rooms`). No TTL / cleanup timer — rooms live as long as any peer is connected.

---

## 6. Client Layer — Hooks

### `useSignaling(myPeerId)`

Manages the Socket.IO connection lifecycle.

**Internal state:**
- `socketRef: useRef` — single socket instance; **never** `useState` (prevents re-render storms)
- `peersRef: useRef(Map)` — mutable peer registry (source of truth)
- `peers: useState([])` — reactive snapshot derived from `peersRef` for UI

**Callback bridge (refs set by App.jsx):**
```js
onPeerJoinedRef.current = (peerId, isInitiator) => { ... }  // → useWebRTC
onPeerLeftRef.current   = (peerId) => { ... }               // → useWebRTC
onSignalRef.current     = (fromPeerId, payload) => { ... }  // → useWebRTC
```

This ref-based bridge decouples the two hooks without context or prop-drilling.

**On `room-peers`:** Calls `onPeerJoinedRef(peerId, true)` for each existing peer — this node is the initiator (polite side).
**On `peer-joined`:** Calls `onPeerJoinedRef(peerId, false)` — the new joiner is the answerer (impolite side).

**Returns:** `{ socketRef, peers, roomId, connectionStatus, joinRoom, leaveRoom, sendSignal, onPeerJoinedRef, onPeerLeftRef, onSignalRef }`

---

### `useWebRTC(myPeerId, sendSignal)`

Manages `RTCPeerConnection` instances and DataChannels for every peer.

**Two DataChannel types per peer:**

| Channel | Config | Use |
|---|---|---|
| `"inference"` | `ordered: false, maxRetransmits: 0` | Token streaming (UDP-like, no HOL blocking) |
| `"control"` | `ordered: true` | Heartbeat, TASK_ASSIGN, TASK_DONE (reliable) |

**Perfect Negotiation pattern:**

Collision detection uses a lexicographic comparison: `isPolite = (myPeerId > fromPeerId)`.
- Polite peer: accepts offers, performs rollback if needed
- Impolite peer: ignores colliding offers, proceeds with its own

This makes role assignment deterministic and requires no out-of-band coordination.

**Heartbeat loop:** Every 5 seconds, broadcasts `HEARTBEAT` on the control channel. RTT is measured as `Date.now() - msg.ts` on `HEARTBEAT_ACK`. RTTs are stored in `rttMap` (App state) for display.

**Message routing:** `onMessageRef.current(fromPeerId, decodedMsg, channelLabel)` is called for every inbound DataChannel message. App.jsx sets this ref to dispatch the message to the appropriate handler.

**Returns:** `{ channelStatus, sendToPeer, broadcastToPeers, handleSignal, createPeerConnection, closePeerConnection, openChannelCount, onMessageRef }`

---

### `useAgenticSwarm(myPeerId, openPeers, sendToPeer, generate)`

Distributed inference orchestration using a map-reduce pattern.

**`submitPrompt(userPrompt, onToken)`:**
1. `decomposePrompt(prompt, peerCount)` splits the prompt into N subtasks
2. If only 1 subtask or 0 open peers → falls back to local `generate()`
3. Round-robin assignment: peer[i % peers.length] gets subtask[i]; remainder goes to self
4. Remote peers receive `TASK_ASSIGN` on the control channel
5. Results are collected via Promises with 30s timeout (timeout → local fallback)
6. Final output is `subtaskResults.join('\n\n')`

**Decomposition strategies (in priority order):**
1. Split on `?` — detects multi-question prompts
2. Match `1. ... 2. ...` — detects numbered lists
3. Sentence-level chunking divided evenly — default fallback

**`handleIncomingTask(fromPeerId, payload)`:**
Runs local inference, streams each token as `TASK_RESULT` on the inference channel, then sends `TASK_DONE` on control.

**Returns:** `{ submitPrompt, handleIncomingTask, handleTaskResult, taskQueue, swarmStatus, assembledOutput, swarmLog }`

---

## 7. Client Layer — Libraries

### `lib/constants.js`

```js
ICE_SERVERS            // Google STUN only (no TURN) — fine for LAN/co-lo; needs TURN for NAT traversal
INFERENCE_CHANNEL_CONFIG  // { label: 'inference', ordered: false, maxRetransmits: 0 }
CONTROL_CHANNEL_CONFIG    // { label: 'control', ordered: true }
SIGNAL_URL             // 3-tier: VITE_SIGNAL_URL → dev localhost → same-origin (production proxy)
DEFAULT_ROOM           // VITE_DEFAULT_ROOM || 'hackathon-demo'
ENGINE_MODEL_ID        // VITE_ENGINE_MODEL || 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC'
HEARTBEAT_INTERVAL_MS  // 5000
TASK_TIMEOUT_MS        // 30000
```

### `lib/protocol.js`

```js
MSG = {
  PEER_CAPS, HEARTBEAT, HEARTBEAT_ACK,
  TASK_ASSIGN, TASK_RESULT, TASK_DONE, TASK_REJECT,
  INFER_REQUEST, INFER_TOKEN, INFER_DONE, INFER_ERROR,
}

encodeMessage(type, payload) → JSON string with { type, payload, ts }
decodeMessage(data)          → parsed object (handles ArrayBuffer or string)
chunkArrayBuffer(buffer, taskId)  → yields 16KB chunks (safe below SCTP MTU)
decomposePrompt(prompt, peerCount) → string[]
```

**Why 16KB chunks?** SCTP (DataChannel transport) has a practical MTU of ~64KB but fragmentation overhead grows with size. 16KB keeps individual chunks well below this limit while minimizing round-trips.

### `lib/webllm.js`

```js
hasWebGPU()             → bool — checks navigator.gpu
getGPUInfo()            → adapter info (name, VRAM tier)

getEngine(onProgress)   → MLCEngine singleton
  // deduplication: if loadingPromise exists, returns existing Promise — prevents double init

generate(prompt, onToken, maxTokens=512)
  → streams tokens via OpenAI-compatible chat.completions.create({ stream: true })

resetEngine()           → clears singleton + chat history
```

Model files are fetched once and cached by WebLLM in **OPFS** (Origin Private File System) — a separate storage bucket per origin that survives page refreshes but is isolated from the regular filesystem.

---

## 8. Client Layer — Components

### `App.jsx` — Root Component (401 lines)

**State owned at App level:**

| State | Type | Purpose |
|---|---|---|
| `myPeerId` | string | `crypto.randomUUID()` at mount, stable for session |
| `username` | string | Persisted in `localStorage` as `gcc_username` |
| `role` | `'donor'\|'receiver'` | Chosen before joining; determines layout |
| `joined` | bool | Controls join-panel vs. main app layout |
| `tokens` | `{role, text}[]` | Chat history for InferenceTerminal |
| `isGenerating` | bool | Inference in progress |
| `streamingFrom` | string | peerId of the donor serving this request |
| `rttMap` | `Map<peerId, ms>` | Heartbeat RTTs for NodeCard display |
| `modelStatus` | string | `'not loaded' \| 'loading' \| 'ready'` |
| `loadProgress` | `{progress, text}` | WebLLM download progress |
| `gpuAvailable` | bool | `hasWebGPU()` result on mount |
| `isServingInference` | bool | Donor: currently running remote inference |
| `servedCount` | number | Donor: total INFER_REQUESTs handled |
| `lastServedAt` | number | Donor: epoch ms of last request |

**Inbound DataChannel message dispatch table:**

| Message Type | Handler | Channel |
|---|---|---|
| `HEARTBEAT` | Reply `HEARTBEAT_ACK` with original `ts` | control |
| `HEARTBEAT_ACK` | Compute RTT; update `rttMap` | control |
| `PEER_CAPS` | No-op (hook for future peer scoring) | control |
| `INFER_REQUEST` | Run local `generate()`, stream `INFER_TOKEN`, send `INFER_DONE` | inference |
| `INFER_TOKEN` | Append token to last assistant entry in `tokens` | inference |
| `INFER_DONE` | Clear `isGenerating`, clear `streamingFrom` | control |
| `INFER_ERROR` | Append error message to `tokens` | control |
| `TASK_ASSIGN` | `swarm.handleIncomingTask()` (donor only) | control |
| `TASK_DONE` | `swarm.handleTaskResult()` | control |
| `TASK_REJECT` | No-op (future fallback) | control |

**Donor inference routing in `handlePromptSubmit`:**
- Receiver: selects a donor peer using round-robin (filters `role === 'donor' && channelStatus === 'open'`); sends `INFER_REQUEST`
- Donor: runs local inference via `generate()` directly

### Component Responsibilities

| Component | Role |
|---|---|
| `ClusterDashboard` | Stats bar (Signal/Room/Peers/Channels/Donors/Receivers) + `NodeCard` grid |
| `NodeCard` | Per-peer: username, role badge, status dot, RTT ms, channel state |
| `InferenceTerminal` | Chat input + streaming token output with auto-scroll and blinking cursor |
| `SwarmLog` | Scrollable level-colored event log |
| `DonorDashboard` | Three-column full-width donor view: metrics + globe + network diagram |
| `EarthHologramGlobe` | Three.js WebGL land-point-cloud globe (28,000 Fibonacci sphere points) |
| `HolographicGlobe` | Pure SVG wireframe fallback globe with CSS animations |

---

## 9. Data Flow: Full Lifecycle

### A. Peer Joins

```
Browser loads React SPA
→ App.jsx: myPeerId = crypto.randomUUID()
→ User fills username, selects role, enters roomId
→ joinRoom() called
→ useSignaling: socket.emit('join-room', { roomId, peerId, gpuCapable, role, username })
→ Server: RoomManager.join() → emits 'room-peers' to joiner + 'peer-joined' to room
→ useSignaling: for each existing peer → onPeerJoinedRef(peerId, isInitiator=true)
→ useWebRTC: createPeerConnection(peerId)
  → Creates RTCPeerConnection with ICE servers
  → Creates DataChannels: 'inference' (UDP-like) + 'control' (reliable)
  → Starts Perfect Negotiation offer/answer exchange via socket.emit('signal')
→ ICE candidates exchanged via 'signal' relay
→ DTLS handshake completes → DataChannels open
→ Heartbeat loop starts (5s interval)
→ channelStatus → 'open'
```

### B. Receiver Sends Prompt

```
User types prompt in InferenceTerminal → handlePromptSubmit()
→ Select donor: peers.filter(p => p.role==='donor' && channelStatus==='open')[roundRobinIdx]
→ sendToPeer(donorId, encodeMessage(MSG.INFER_REQUEST, { prompt }), 'inference')
→ isGenerating = true, streamingFrom = donorId
→ tokens.push({ role: 'assistant', text: '' })

[on donor side]
→ onMessageRef called with INFER_REQUEST
→ handleRemoteInferenceRequest():
  → generate(prompt, onToken, 512) with streaming
  → onToken callback: sendToPeer(receiverId, encodeMessage(MSG.INFER_TOKEN, { token }))
  → on completion: sendToPeer(receiverId, encodeMessage(MSG.INFER_DONE, {}))
  → isServingInference = true → false, servedCount++

[back on receiver]
→ INFER_TOKEN: tokens[last].text += token → React re-renders terminal
→ INFER_DONE: isGenerating = false, streamingFrom = null
```

### C. Distributed Swarm Task

```
swarm.submitPrompt(prompt, onToken):
→ decomposePrompt(prompt, peerCount) → ['subtask1', 'subtask2', 'subtask3']
→ Assign round-robin:
    peer[0] ← subtask[0] (TASK_ASSIGN on control channel)
    peer[1] ← subtask[1] (TASK_ASSIGN on control channel)
    self    ← subtask[2] (generate() locally)
→ Await Promise.all([remote0, remote1, localResult])
  (remote timeouts: 30s → local fallback)
→ Join results: result0 + '\n\n' + result1 + '\n\n' + localResult
```

---

## 10. WebRTC Handshake & Perfect Negotiation

```
Peer A (isInitiator=true)               Signaling Server         Peer B (isInitiator=false)
      |                                        |                          |
      |── createPeerConnection(B) ──────────► |                          |
      |   addTransceivers / createDataChannels                           |
      |   onnegotiationneeded fires                                      |
      |── setLocalDescription(offer) ────────► |                          |
      |── signal { type:'offer', sdp } ──────► |── forward to B ────────► |
      |                                        |                  setRemoteDescription(offer)
      |                                        |                  setLocalDescription(answer)
      |◄─────────────────────────────────────────── signal { type:'answer', sdp } ◄──── |
      |── setRemoteDescription(answer)         |                          |
      |                                        |                          |
      |── signal { candidate } ─────────────► |── forward to B ────────► |── addIceCandidate
      |◄─────────────────── signal { candidate } ◄──────────────────────── |
      |── addIceCandidate                      |                          |
      |                                        |                          |
      |══════════════ DTLS handshake ══════════════════════════════════════|
      |══════════════ DataChannels open ═══════════════════════════════════|
```

**Collision handling:** If both peers call `setLocalDescription` simultaneously (both fire `onnegotiationneeded`), the polite peer (higher lexicographic peerId) rolls back its own offer and accepts the impolite peer's offer. This is handled entirely in the `onsignalmessage` handler without any server coordination.

---

## 11. Agentic Swarm Protocol

```
Orchestrator                    Worker A                    Worker B
      |                              |                           |
      |── TASK_ASSIGN { subtask0 } ─► |                           |
      |── TASK_ASSIGN { subtask1 } ──────────────────────────────► |
      |── generate(subtask2) locally                              |
      |                         [Worker A runs inference]         |
      |◄── TASK_RESULT { token } ─── |  (streaming, per token)   |
      |◄── TASK_DONE { result } ──── |                           |
      |                                              [Worker B runs inference]
      |◄──────────────────────────────── TASK_RESULT { token } ─── |
      |◄──────────────────────────────── TASK_DONE { result } ───── |
      |                              |                           |
      |── assemble: result0 + '\n\n' + result1 + '\n\n' + local    |
```

---

## 12. Role System

| Aspect | Donor | Receiver |
|---|---|---|
| Layout | `DonorDashboard` (3-col, full-width) | `ClusterDashboard` + `InferenceTerminal` |
| Primary action | Serve remote `INFER_REQUEST`s | Send prompts, receive streamed tokens |
| WebLLM | Loads model on join (`auto_load=true`) | Only loads if no donor available |
| Prompt routing | `generate()` locally and stream back | `sendToPeer(donorId, INFER_REQUEST)` |
| Swarm tasks | `handleIncomingTask()` when `TASK_ASSIGN` arrives | Never receives tasks |
| Heartbeat | Sends + responds | Sends + responds |

Both roles participate equally in the P2P mesh (both create `RTCPeerConnection`s). The role distinction is purely at the application layer.

---

## 13. Deployment Architecture

```
Internet
    │
    ▼
dev-ai.nomineelife.com  (DigitalOcean Droplet — Caddy v2, port 443 HTTPS)
    │
    ├── /socket.io*  ──► reverse_proxy localhost:3001  (Socket.IO signaling)
    ├── /health      ──► reverse_proxy localhost:3001
    └── /cluster/*   ──► file_server /var/www/.../client/dist + SPA fallback

                    (bare domain → 302 redirect to /cluster/)

localhost:3001  ──► Node.js server/index.js  (Express + Socket.IO)
```

**HTTPS:** Caddy handles automatic TLS via Let's Encrypt. No manual certificate management needed.

**Note — known production config gap:** `client/vite.config.js` does not set `base: '/cluster/'`. Without this, Vite builds asset paths as `/assets/...` which will 404 under the `/cluster/` sub-path. Fix: add `base: '/cluster/'` to `vite.config.js` before production build.

---

## 14. Known Gaps & Gotchas

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | No TURN server configured | P2P fails through symmetric NAT (common in corporate networks) | Add Twilio/Metered TURN credentials to `ICE_SERVERS` |
| 2 | `base: '/cluster/'` missing in vite.config.js | Asset 404s in production sub-path deployment | Add `base: '/cluster/'` |
| 3 | No authentication on signaling | Any peer can join any room | Add room passwords or JWT for private demos |
| 4 | RoomManager is in-memory only | Signaling server restart drops all rooms | Acceptable for hackathon; production needs Redis |
| 5 | `INFER_REQUEST` goes to first available donor only | No load balancing | Implement RTT-weighted donor selection |
| 6 | `decomposePrompt` uses naive text splitting | Poor quality decomposition for complex prompts | LLM-assisted decomposition |
| 7 | React StrictMode disabled intentionally | Hard to debug double-mount issues | Effects are intentionally non-idempotent (socket) — leave disabled |
| 8 | No error recovery for DataChannel re-open | Channel dies on network change → stuck | Implement re-negotiation on `channel.onerror` |

---

## 15. Feasibility: Distributed Video Rendering

### Concept

> **The Render Farm:** Using WebGPU/WebGL (Three.js), assign different frame ranges to different laptop nodes. Each worker renders its frames to raw `ImageData`, sends the pixel blobs back over DataChannel to an orchestrator that stitches them into a final video.

### Verdict: **Fully Feasible — Excellent Fit**

The existing P2P infrastructure (DataChannels, role system, task decomposition, blob chunking) maps almost perfectly to what a render farm needs. Three.js is already a **production dependency** in this project (used for `EarthHologramGlobe`).

---

### What Already Exists (No New Infrastructure Needed)

| Existing Capability | How It Maps to Rendering |
|---|---|
| `useWebRTC` DataChannels | Transferring `ArrayBuffer` frame blobs between nodes |
| `chunkArrayBuffer()` in `protocol.js` | 16KB chunking for large frame blobs (already implemented) |
| `TASK_ASSIGN` / `TASK_DONE` protocol | Assign frame ranges → receive rendered blobs |
| `useAgenticSwarm` round-robin dispatch | Distribute frame ranges across worker nodes |
| Three.js (`^0.160.0`) already installed | Scene rendering, `WebGLRenderer`, `OffscreenCanvas` |
| Donor/Receiver role system | Donors = workers; Receiver = orchestrator that initiates + stitches |
| SwarmLog component | Display render progress per node |
| ClusterDashboard / NodeCard | Show per-node frame assignment status |

---

### New Message Types Required

Add to `MSG` enum in `lib/protocol.js`:

```js
RENDER_START:   'RENDER_START',    // Orchestrator → Workers: scene JSON + frame range
RENDER_FRAME:   'RENDER_FRAME',    // Worker → Orchestrator: rendered frame blob chunk
RENDER_DONE:    'RENDER_DONE',     // Worker → Orchestrator: all frames sent
RENDER_ABORT:   'RENDER_ABORT',    // Cancel in-flight render job
RENDER_PROGRESS:'RENDER_PROGRESS', // Worker → Orchestrator: % complete update
```

---

### New Hook: `useRenderFarm`

```js
// Orchestrator side
submitRenderJob(sceneJSON, totalFrames, fps) {
  const frameRanges = splitFrames(totalFrames, openDonors.length)
  // e.g. 5 donors, 300 frames → [0-59], [60-119], [120-179], [180-239], [240-299]
  frameRanges.forEach((range, i) => {
    sendToPeer(donors[i], encodeMessage(MSG.RENDER_START, {
      sceneJSON,
      startFrame: range.start,
      endFrame: range.end,
      fps,
      jobId: crypto.randomUUID()
    }), 'control')
  })
  // Collect RENDER_FRAME blobs → assemble video
}

// Worker side
handleRenderJob({ sceneJSON, startFrame, endFrame, fps, jobId }) {
  const scene = JSON.parse(sceneJSON)        // or ObjectLoader.parse()
  const renderer = new THREE.WebGLRenderer({ canvas: offscreenCanvas })
  for (let f = startFrame; f <= endFrame; f++) {
    applyKeyframes(scene, f, fps)            // advance animation
    renderer.render(scene.scene, scene.camera)
    const imageData = renderer.domElement.toDataURL('image/png')  // or readPixels
    // Chunk and send back
    sendToPeer(orchestratorId, encodeMessage(MSG.RENDER_FRAME, {
      jobId, frameIndex: f, blob: imageData
    }), 'inference')   // use high-throughput inference channel
  }
  sendToPeer(orchestratorId, encodeMessage(MSG.RENDER_DONE, { jobId }), 'control')
}
```

---

### Video Assembly on Orchestrator

Collect all frames → use the **Web Codecs API** (Chrome 94+) to encode into a video container:

```js
const encoder = new VideoEncoder({
  output: (chunk, metadata) => { muxer.addVideoChunk(chunk, metadata) },
  error: (e) => console.error(e),
})
encoder.configure({ codec: 'vp8', width: 1920, height: 1080, bitrate: 5_000_000, framerate: fps })

for (const [frameIndex, imageData] of sortedFrames) {
  const videoFrame = new VideoFrame(imageData, { timestamp: (frameIndex / fps) * 1e6 })
  encoder.encode(videoFrame)
  videoFrame.close()
}
await encoder.flush()
```

Final output: offer user a `.webm` download via `URL.createObjectURL(blob)`.

Alternatively, use a canvas-to-Blob approach with `MediaRecorder` for simpler (but less efficient) output.

---

### OffscreenCanvas Consideration

Three.js rendering on workers should use `OffscreenCanvas` to avoid blocking the main thread:

```js
// In a Web Worker:
const offscreen = new OffscreenCanvas(1920, 1080)
const renderer = new THREE.WebGLRenderer({ canvas: offscreen, antialias: true })
```

This keeps the UI responsive while heavy rendering happens in the background.

---

### Implementation Plan (Separate Tab)

**UI location:** Add a new tab to the App. When `role === 'receiver'`, show tabs: `[LLM Inference] [Render Farm]`.

**New files to create:**
```
client/src/hooks/useRenderFarm.js       Orchestrator + worker logic
client/src/components/RenderFarmPanel.jsx  Upload scene, trigger render, preview frames, download video
client/src/components/RenderProgress.jsx   Per-node frame progress bars
```

**Modifications to existing files:**
- `lib/protocol.js` — add 5 new `MSG` entries
- `App.jsx` — add dispatch cases for `RENDER_*` messages; pass `useRenderFarm` hook
- `lib/constants.js` — add `RENDER_TIMEOUT_MS = 120000`

**No server changes required.** All render coordination happens over the existing DataChannels.

---

### Limitations & Mitigations

| Limitation | Mitigation |
|---|---|
| Frame blobs are large (~500KB per 1080p PNG) | Use JPEG (10-20KB/frame) or WebP; downsample to 720p for demo |
| Scene must be serializable to JSON | Use `THREE.ObjectExporter` / `THREE.AnimationClip` JSON format |
| No `OffscreenCanvas` guarantees in all browsers | Graceful fallback to on-thread rendering in donor's worker process |
| Rendering speed varies by GPU | Assign more frames to nodes with lower RTT / higher GPU tier |
| Large frame blobs need reliable transport | Use the `control` (ordered, reliable) channel for frame transfer instead of inference channel |

---

### Summary

The Distributed Video Rendering feature would take this project from "distributed LLM cluster" to a full **browser-based render farm** — two compute-distribution use-cases on one P2P infrastructure. The core DataChannel plumbing, chunking utilities, task dispatch system, and Three.js dependency are already in place. The main additions are: a new hook, a new UI tab/panel, 5 new message types, and OffscreenCanvas rendering logic. The existing donor/receiver role system maps perfectly (workers = donors, orchestrator = receiver who initiates the job).

Estimated scope: **~400–600 lines of new code**, zero new infrastructure, zero new npm dependencies.
