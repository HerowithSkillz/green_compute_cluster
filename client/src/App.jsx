import React, { useState, useEffect, useCallback } from 'react';
import { useSignaling } from './hooks/useSignaling.js';
import { useWebRTC } from './hooks/useWebRTC.js';
import { useAgenticSwarm } from './hooks/useAgenticSwarm.js';
import ClusterDashboard from './components/ClusterDashboard.jsx';
import InferenceTerminal from './components/InferenceTerminal.jsx';
import SwarmLog from './components/SwarmLog.jsx';
import { MSG, encodeMessage } from './lib/protocol.js';
import { getEngine, hasWebGPU, getGPUInfo } from './lib/webllm.js';
import { DEFAULT_ROOM, HEARTBEAT_INTERVAL_MS, ENGINE_MODEL_ID } from './lib/constants.js';

function App() {
  const [myPeerId] = useState(() => crypto.randomUUID());
  const [roomInput, setRoomInput] = useState(DEFAULT_ROOM);
  const [joined, setJoined] = useState(false);
  const [tokens, setTokens] = useState([]);        // { role: 'user'|'assistant', text }
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingFrom, setStreamingFrom] = useState(null);
  const [rttMap, setRttMap] = useState(new Map());
  const [modelStatus, setModelStatus] = useState('not loaded'); // not loaded | loading | ready
  const [loadProgress, setLoadProgress] = useState(null);
  const [gpuAvailable] = useState(() => hasWebGPU());

  // Hooks
  const signaling = useSignaling(myPeerId);
  const webrtc = useWebRTC(myPeerId, signaling.sendSignal);
  const swarm = useAgenticSwarm(myPeerId, signaling.peers, webrtc.channelStatus, webrtc.sendToPeer);

  // Wire signaling callbacks to WebRTC
  useEffect(() => {
    signaling.onPeerJoinedRef.current = (peerId, isInitiator) => {
      webrtc.createPeerConnection(peerId, isInitiator);
    };
    signaling.onPeerLeftRef.current = (peerId) => {
      webrtc.closePeerConnection(peerId);
    };
    signaling.onSignalRef.current = (from, payload) => {
      webrtc.handleSignal(from, payload);
    };
  }, [signaling, webrtc]);

  // Handle incoming DataChannel messages
  useEffect(() => {
    webrtc.onMessageRef.current = (fromPeerId, msg, channelLabel) => {
      switch (msg.type) {
        case MSG.HEARTBEAT:
          webrtc.sendToPeer(fromPeerId, encodeMessage(MSG.HEARTBEAT_ACK, { echoTs: msg.payload.ts }), 'control');
          break;

        case MSG.HEARTBEAT_ACK: {
          const rtt = Date.now() - msg.payload.echoTs;
          setRttMap(prev => { const n = new Map(prev); n.set(fromPeerId, rtt); return n; });
          break;
        }

        case MSG.PEER_CAPS:
          // Could store in a peer capabilities map for scoring
          break;

        case MSG.INFER_REQUEST: {
          // Another peer wants us to run inference
          const { requestId, prompt, maxTokens } = msg.payload;
          handleRemoteInferenceRequest(fromPeerId, requestId, prompt, maxTokens);
          break;
        }

        case MSG.INFER_TOKEN:
          // Incoming streamed token
          setTokens(prev => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant') {
              return [...prev.slice(0, -1), { ...last, text: last.text + msg.payload.token }];
            }
            return [...prev, { role: 'assistant', text: msg.payload.token }];
          });
          break;

        case MSG.INFER_DONE:
          setIsGenerating(false);
          setStreamingFrom(null);
          break;

        case MSG.INFER_ERROR:
          setTokens(prev => [...prev, { role: 'assistant', text: `[Error: ${msg.payload.error}]` }]);
          setIsGenerating(false);
          setStreamingFrom(null);
          break;

        case MSG.TASK_ASSIGN:
          swarm.handleIncomingTask(fromPeerId, msg.payload);
          break;

        case MSG.TASK_DONE:
          swarm.handleTaskResult(fromPeerId, msg.payload);
          break;

        case MSG.TASK_REJECT:
          // Handle rejection — could fallback to local
          break;
      }
    };
  }, [webrtc, swarm]);

  // Heartbeat interval
  useEffect(() => {
    if (!joined) return;
    const interval = setInterval(() => {
      webrtc.broadcastToPeers(encodeMessage(MSG.HEARTBEAT, { ts: Date.now() }), 'control');
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [joined, webrtc]);

  // Broadcast capabilities when a new channel opens
  useEffect(() => {
    if (webrtc.openChannelCount > 0) {
      (async () => {
        const gpuInfo = await getGPUInfo();
        webrtc.broadcastToPeers(encodeMessage(MSG.PEER_CAPS, {
          gpuVRAM: gpuInfo,
          model: ENGINE_MODEL_ID,
          loadedAt: Date.now(),
          maxConcurrent: 1,
        }), 'control');
      })();
    }
  }, [webrtc.openChannelCount, webrtc]);

  // Handle remote inference request (this node runs inference for another peer)
  const handleRemoteInferenceRequest = useCallback(async (fromPeerId, requestId, prompt, maxTokens) => {
    try {
      const { generate } = await import(/* @vite-ignore */ './lib/webllm.js');
      await generate(prompt, (token) => {
        webrtc.sendToPeer(fromPeerId, encodeMessage(MSG.INFER_TOKEN, { requestId, token }), 'inference');
      }, maxTokens);
      webrtc.sendToPeer(fromPeerId, encodeMessage(MSG.INFER_DONE, { requestId }), 'control');
    } catch (err) {
      webrtc.sendToPeer(fromPeerId, encodeMessage(MSG.INFER_ERROR, { requestId, error: err.message }), 'control');
    }
  }, [webrtc]);

  // Join room
  const handleJoinRoom = useCallback(() => {
    if (!roomInput.trim()) return;
    const gpuCapable = hasWebGPU();
    signaling.joinRoom(roomInput.trim(), gpuCapable);
    setJoined(true);
  }, [roomInput, signaling]);

  // Leave room
  const handleLeaveRoom = useCallback(() => {
    signaling.leaveRoom();
    setJoined(false);
  }, [signaling]);

  // Load LLM model
  const handleLoadModel = useCallback(async () => {
    setModelStatus('loading');
    try {
      await getEngine((report) => {
        setLoadProgress(report);
      });
      setModelStatus('ready');
    } catch (err) {
      console.error('[App] Model load failed:', err);
      setModelStatus('not loaded');
    }
  }, []);

  // Submit inference prompt
  const handlePromptSubmit = useCallback(async (prompt) => {
    setTokens(prev => [...prev, { role: 'user', text: prompt }]);
    setIsGenerating(true);

    // Check if we have open peers to distribute to
    const openPeers = signaling.peers.filter(
      p => webrtc.channelStatus.get(p.peerId) === 'open'
    );

    if (openPeers.length > 0) {
      // Use swarm dispatch
      setStreamingFrom('swarm');
      setTokens(prev => [...prev, { role: 'assistant', text: '' }]);

      const result = await swarm.submitPrompt(prompt, (token) => {
        setTokens(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant') {
            return [...prev.slice(0, -1), { ...last, text: last.text + token }];
          }
          return [...prev, { role: 'assistant', text: token }];
        });
      });

      setIsGenerating(false);
      setStreamingFrom(null);
    } else {
      // Local inference
      setStreamingFrom('local');
      setTokens(prev => [...prev, { role: 'assistant', text: '' }]);

      try {
        const { generate } = await import(/* @vite-ignore */ './lib/webllm.js');
        await generate(prompt, (token) => {
          setTokens(prev => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant') {
              return [...prev.slice(0, -1), { ...last, text: last.text + token }];
            }
            return [...prev, { role: 'assistant', text: token }];
          });
        });
      } catch (err) {
        setTokens(prev => [...prev, { role: 'assistant', text: `[Error: ${err.message}]` }]);
      }

      setIsGenerating(false);
      setStreamingFrom(null);
    }
  }, [signaling.peers, webrtc.channelStatus, swarm]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Green Compute Cluster</h1>
        <span className="peer-id" title={myPeerId}>Node: {myPeerId.slice(0, 8)}</span>
      </header>

      {!joined ? (
        <div className="join-panel">
          <div className="join-card">
            <h2>Join a Cluster Room</h2>
            <p className="join-description">
              Connect your browser to a P2P inference mesh. All compute runs locally via WebGPU — zero server cost.
            </p>
            <div className="join-form">
              <input
                type="text"
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value)}
                placeholder="Room name..."
                onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
              />
              <button onClick={handleJoinRoom} disabled={signaling.connectionStatus !== 'connected'}>
                {signaling.connectionStatus === 'connected' ? 'Join Room' : 'Connecting...'}
              </button>
            </div>
            <div className="join-info">
              <span className={`gpu-badge ${gpuAvailable ? 'gpu-yes' : 'gpu-no'}`}>
                {gpuAvailable ? 'WebGPU Available' : 'No WebGPU — CPU Only'}
              </span>
              <span className={`signal-badge status-${signaling.connectionStatus}`}>
                Signal: {signaling.connectionStatus}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="main-layout">
          <div className="top-bar">
            <div className="room-info">
              <span>Room: <strong>{signaling.roomId}</strong></span>
              <button className="btn-leave" onClick={handleLeaveRoom}>Leave</button>
            </div>
            <div className="model-controls">
              {modelStatus === 'not loaded' && (
                <button className="btn-load-model" onClick={handleLoadModel}>
                  Load LLM ({ENGINE_MODEL_ID.split('-').slice(0, 2).join('-')})
                </button>
              )}
              {modelStatus === 'loading' && (
                <span className="model-loading">
                  Loading... {loadProgress ? `${(loadProgress.progress * 100).toFixed(0)}%` : ''}
                </span>
              )}
              {modelStatus === 'ready' && (
                <span className="model-ready">Model Ready</span>
              )}
            </div>
          </div>

          <div className="content-grid">
            <div className="col-left">
              <ClusterDashboard
                peers={signaling.peers}
                channelStatus={webrtc.channelStatus}
                rttMap={rttMap}
                connectionStatus={signaling.connectionStatus}
                roomId={signaling.roomId}
                openChannelCount={webrtc.openChannelCount}
              />
              <SwarmLog logs={swarm.swarmLog} />
            </div>
            <div className="col-right">
              <InferenceTerminal
                onSubmit={handlePromptSubmit}
                tokens={tokens}
                isGenerating={isGenerating}
                streamingFrom={streamingFrom}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
