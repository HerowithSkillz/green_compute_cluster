import { useRef, useState, useCallback, useEffect } from 'react';
import { ICE_SERVERS, INFERENCE_CHANNEL_CONFIG, CONTROL_CHANNEL_CONFIG } from '../lib/constants.js';
import { decodeMessage } from '../lib/protocol.js';

const ICE_CONFIG = { iceServers: ICE_SERVERS };

/**
 * useWebRTC — Manages RTCPeerConnection lifecycle and DataChannels.
 * Implements the W3C "Perfect Negotiation" pattern for collision-free setup.
 */
export function useWebRTC(myPeerId, sendSignal) {
  const peerConnections = useRef(new Map());   // peerId → RTCPeerConnection
  const inferenceChannels = useRef(new Map()); // peerId → RTCDataChannel (inference)
  const controlChannels = useRef(new Map());   // peerId → RTCDataChannel (control)
  const makingOffer = useRef(new Map());       // peerId → boolean
  const [channelStatus, setChannelStatus] = useState(new Map()); // peerId → 'connecting'|'open'|'closed'

  // External message handler — components attach to this
  const onMessageRef = useRef(null);

  const updateChannelStatus = useCallback((peerId, status) => {
    setChannelStatus(prev => {
      const next = new Map(prev);
      next.set(peerId, status);
      return next;
    });
  }, []);

  const setupDataChannel = useCallback((peerId, channel, channelMap) => {
    channel.onopen = () => {
      console.log(`[WebRTC] DataChannel '${channel.label}' open with ${peerId}`);
      channelMap.current.set(peerId, channel);
      if (channel.label === 'inference') {
        updateChannelStatus(peerId, 'open');
      }
    };

    channel.onclose = () => {
      console.log(`[WebRTC] DataChannel '${channel.label}' closed with ${peerId}`);
      channelMap.current.delete(peerId);
      if (channel.label === 'inference') {
        updateChannelStatus(peerId, 'closed');
      }
    };

    channel.onerror = (e) => {
      console.error(`[WebRTC] DataChannel '${channel.label}' error with ${peerId}:`, e);
    };

    channel.onmessage = (event) => {
      const msg = decodeMessage(event.data);
      if (msg) {
        onMessageRef.current?.(peerId, msg, channel.label);
      }
    };
  }, [updateChannelStatus]);

  const createPeerConnection = useCallback((peerId, isInitiator) => {
    if (peerConnections.current.has(peerId)) return peerConnections.current.get(peerId);

    console.log(`[WebRTC] Creating PC for ${peerId}, initiator=${isInitiator}`);
    const pc = new RTCPeerConnection(ICE_CONFIG);
    peerConnections.current.set(peerId, pc);
    updateChannelStatus(peerId, 'connecting');

    // ICE candidate trickle
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(peerId, { type: 'candidate', candidate: event.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state with ${peerId}: ${pc.connectionState}`);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        closePeerConnection(peerId);
      }
    };

    // Perfect Negotiation: onnegotiationneeded
    pc.onnegotiationneeded = async () => {
      try {
        makingOffer.current.set(peerId, true);
        await pc.setLocalDescription();
        sendSignal(peerId, { type: pc.localDescription.type, sdp: pc.localDescription.sdp });
      } catch (err) {
        console.error('[WebRTC] Negotiation error:', err);
      } finally {
        makingOffer.current.set(peerId, false);
      }
    };

    // Answerer receives data channels
    pc.ondatachannel = (event) => {
      const ch = event.channel;
      if (ch.label === INFERENCE_CHANNEL_CONFIG.label) {
        setupDataChannel(peerId, ch, inferenceChannels);
      } else if (ch.label === CONTROL_CHANNEL_CONFIG.label) {
        setupDataChannel(peerId, ch, controlChannels);
      }
    };

    // Initiator creates data channels
    if (isInitiator) {
      const infCh = pc.createDataChannel(INFERENCE_CHANNEL_CONFIG.label, {
        ordered: INFERENCE_CHANNEL_CONFIG.ordered,
        maxRetransmits: INFERENCE_CHANNEL_CONFIG.maxRetransmits,
      });
      setupDataChannel(peerId, infCh, inferenceChannels);

      const ctrlCh = pc.createDataChannel(CONTROL_CHANNEL_CONFIG.label, {
        ordered: CONTROL_CHANNEL_CONFIG.ordered,
      });
      setupDataChannel(peerId, ctrlCh, controlChannels);
    }

    return pc;
  }, [sendSignal, setupDataChannel, updateChannelStatus]);

  // Handle incoming signaling messages (offer/answer/candidate)
  const handleSignal = useCallback(async (fromPeerId, payload) => {
    let pc = peerConnections.current.get(fromPeerId);

    if (payload.type === 'offer' || payload.type === 'answer') {
      if (!pc) {
        pc = createPeerConnection(fromPeerId, false);
      }

      // Perfect Negotiation collision detection
      if (payload.type === 'offer') {
        const offerCollision =
          makingOffer.current.get(fromPeerId) || pc.signalingState !== 'stable';
        const isPolite = myPeerId > fromPeerId; // deterministic role

        if (offerCollision && !isPolite) return; // impolite peer ignores collision
        if (offerCollision && isPolite) {
          await pc.setLocalDescription({ type: 'rollback' });
        }
      }

      await pc.setRemoteDescription({ type: payload.type, sdp: payload.sdp });

      if (payload.type === 'offer') {
        await pc.setLocalDescription();
        sendSignal(fromPeerId, { type: pc.localDescription.type, sdp: pc.localDescription.sdp });
      }
    } else if (payload.type === 'candidate') {
      if (!pc) {
        pc = createPeerConnection(fromPeerId, false);
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } catch (err) {
        console.error('[WebRTC] addIceCandidate error:', err);
      }
    }
  }, [myPeerId, sendSignal, createPeerConnection]);

  const sendToPeer = useCallback((peerId, message, channel = 'inference') => {
    const ch = channel === 'control'
      ? controlChannels.current.get(peerId)
      : inferenceChannels.current.get(peerId);
    if (ch && ch.readyState === 'open') {
      ch.send(typeof message === 'string' ? message : JSON.stringify(message));
    }
  }, []);

  const broadcastToPeers = useCallback((message, channel = 'inference') => {
    const channels = channel === 'control' ? controlChannels : inferenceChannels;
    const data = typeof message === 'string' ? message : JSON.stringify(message);
    for (const [, ch] of channels.current) {
      if (ch.readyState === 'open') ch.send(data);
    }
  }, []);

  const closePeerConnection = useCallback((peerId) => {
    inferenceChannels.current.get(peerId)?.close();
    inferenceChannels.current.delete(peerId);
    controlChannels.current.get(peerId)?.close();
    controlChannels.current.delete(peerId);
    peerConnections.current.get(peerId)?.close();
    peerConnections.current.delete(peerId);
    makingOffer.current.delete(peerId);
    updateChannelStatus(peerId, 'closed');
  }, [updateChannelStatus]);

  const openChannelCount = [...channelStatus.values()].filter(s => s === 'open').length;

  // Cleanup all connections on unmount
  useEffect(() => {
    return () => {
      for (const peerId of peerConnections.current.keys()) {
        closePeerConnection(peerId);
      }
    };
  }, [closePeerConnection]);

  return {
    channelStatus,
    sendToPeer,
    broadcastToPeers,
    handleSignal,
    createPeerConnection,
    closePeerConnection,
    openChannelCount,
    onMessageRef,
  };
}
