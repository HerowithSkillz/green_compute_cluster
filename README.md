# Green Compute Cluster

Turn idle edge devices into a browser-native distributed compute mesh for AI inference and rendering workloads.

## Problem Statement
Modern compute-intensive applications face a compute scarcity crisis due to expensive, centralized hardware, while millions of consumer devices (edge devices) with powerful CPUs and GPUs remain idle.

Green Compute Cluster solves this by pooling those idle devices directly in the browser using peer-to-peer networking.

## What This Project Does
1. Connects peers into a room through lightweight signaling.
2. Establishes direct WebRTC DataChannel links between browsers.
3. Assigns roles:
	- Donor: contributes local compute (WebGPU/WebGL capable nodes)
	- Receiver: submits jobs and receives streamed outputs
4. Runs distributed workloads without routing payloads through a central compute server:
	- LLM inference token streaming
	- Distributed frame rendering with output preview and downloads

## Core Features
1. P2P architecture: signaling server is only for discovery and SDP/ICE relay.
2. Distributed inference: receiver routes prompts to available donors and streams responses.
3. Agentic swarm orchestration: prompt decomposition + subtask fan-out.
4. Distributed rendering:
	- Real Three.js frame rendering on donor nodes
	- Render progress tracking per worker
	- Frame preview on receiver
	- Download frames as ZIP
	- Optional WebM export via WebCodecs when supported
5. Donor/Receiver dashboards with network and health signals.

## High-Level Architecture
1. Signaling Layer:
	- Socket.IO over WebSocket
	- Room membership, peer join/leave, signal relay
2. Data Layer:
	- WebRTC DataChannels (P2P, encrypted)
	- Inference and render payloads flow directly between peers
3. Compute Layer:
	- WebLLM for browser inference
	- Three.js for browser rendering

## Tech Stack
1. Frontend: React + Vite
2. Realtime signaling: Socket.IO client/server
3. P2P transport: WebRTC DataChannels
4. LLM runtime: @mlc-ai/web-llm
5. Rendering: three
6. Output export:
	- jszip for frame archives
	- webm-muxer + WebCodecs for video export
7. Backend: Express + Socket.IO (signaling only)
8. Reverse proxy/TLS: Caddy

## Repository Structure
1. [client](client)
	- React application, P2P hooks, rendering/inference UI
2. [server](server)
	- Express + Socket.IO signaling relay
3. [caddy](caddy)
	- Reverse proxy and TLS configuration
4. [technical_run_down.md](technical_run_down.md)
	- Full technical breakdown

## Local Setup
Prerequisites:
1. Node.js 18+
2. Chrome/Edge recommended for best feature support

Install dependencies:
1. Client

```bash
cd client
npm install
```

2. Server

```bash
cd ../server
npm install
```

Run in development (two terminals):
1. Start signaling server

```bash
cd server
npm run dev
```

2. Start client

```bash
cd client
npm run dev
```

Client default: http://localhost:5173

## Usage
1. Open the app in two or more browser windows.
2. Join the same room with different usernames.
3. Choose roles:
	- Donor on compute-capable devices
	- Receiver on controlling device
4. Inference flow:
	- Receiver submits prompt
	- Donor streams tokens back over P2P channel
5. Rendering flow:
	- Receiver opens Render Farm tab
	- Provides scene JSON + frames + fps
	- Donors render frame ranges
	- Receiver previews outputs and exports ZIP/WebM

## Deployment Notes (DigitalOcean + Caddy)
1. Deploy server signaling process on port 3001.
2. Serve built client through Caddy over HTTPS.
3. Reverse-proxy /socket.io and /health to signaling server.
4. If hosted under a subpath such as /cluster, set Vite base accordingly in [client/vite.config.js](client/vite.config.js) before build.

## Browser/Platform Notes
1. WebGPU is required for donor-side LLM acceleration.
2. Rendering works with WebGL-capable browsers.
3. WebM export depends on WebCodecs support; ZIP export remains available regardless.
4. Without TURN configuration, some NAT-restricted peer pairs may fail to connect.

## Scripts
Client ([client/package.json](client/package.json)):
1. npm run dev
2. npm run build
3. npm run preview

Server ([server/package.json](server/package.json)):
1. npm run dev
2. npm run start

## Why This Matters
Green Compute Cluster demonstrates a practical path from centralized compute scarcity to decentralized abundance by transforming idle edge hardware into a collaborative, low-cost compute fabric for modern AI and graphics workloads.