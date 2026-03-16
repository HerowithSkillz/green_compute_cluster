import { useRef, useState, useCallback, useEffect } from 'react';
import { io } from 'socket.io-client';
import { SIGNAL_URL } from '../lib/constants.js';

/**
 * useSignaling - Socket.IO lifecycle manager.
 * Owns the signaling connection and translates server events into a reactive peer registry.
 * Does NOT know anything about WebRTC.
 */
export function useSignaling(myPeerId) {
  const socketRef = useRef(null);
  const peersRef = useRef(new Map()); // peerId -> { socketId, gpuCapable, role, username, joinedAt }
  const [roomId, setRoomId] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('idle'); // idle | connecting | connected | error
  const [peers, setPeers] = useState([]); // reactive snapshot for UI

  // Callbacks that useWebRTC will attach to
  const onPeerJoinedRef = useRef(null);
  const onPeerLeftRef = useRef(null);
  const onSignalRef = useRef(null);

  const syncPeers = useCallback(() => {
    setPeers([...peersRef.current.entries()].map(([id, meta]) => ({ peerId: id, ...meta })));
  }, []);

  const joinRoom = useCallback((targetRoomId, gpuCapable = true, role = 'donor', username = '') => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) return;

    socket.emit('join-room', {
      roomId: targetRoomId,
      peerId: myPeerId,
      gpuCapable,
      role,
      username: String(username || '').trim(),
    });
    setRoomId(targetRoomId);
  }, [myPeerId]);

  const leaveRoom = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !roomId) return;

    socket.emit('leave-room', { roomId, peerId: myPeerId });
    peersRef.current.clear();
    syncPeers();
    setRoomId(null);
  }, [myPeerId, roomId, syncPeers]);

  const sendSignal = useCallback((to, payload) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('signal', { to, payload });
  }, []);

  // Connect socket on mount, disconnect on unmount
  useEffect(() => {
    setConnectionStatus('connecting');

    const socket = io(SIGNAL_URL, {
      transports: ['websocket'],
      autoConnect: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnectionStatus('connected');
      console.log('[Signaling] Connected:', socket.id);
    });

    socket.on('connect_error', () => {
      setConnectionStatus('error');
    });

    socket.on('disconnect', () => {
      setConnectionStatus('idle');
    });

    // Server sends existing peers on join
    socket.on('room-peers', (existingPeers) => {
      peersRef.current.clear();
      for (const peer of existingPeers) {
        peersRef.current.set(peer.peerId, {
          socketId: peer.socketId,
          gpuCapable: peer.gpuCapable,
          role: peer.role,
          username: peer.username,
          joinedAt: peer.joinedAt,
        });
      }
      syncPeers();

      // Initiate WebRTC with each existing peer (we are the initiator)
      for (const peer of existingPeers) {
        onPeerJoinedRef.current?.(peer.peerId, true);
      }
    });

    // New peer joins after us - we wait as answerer (the joiner initiates)
    socket.on('peer-joined', ({ peerId, gpuCapable, role, username }) => {
      peersRef.current.set(peerId, { gpuCapable, role, username, joinedAt: Date.now() });
      syncPeers();
      onPeerJoinedRef.current?.(peerId, false);
    });

    socket.on('peer-left', ({ peerId }) => {
      peersRef.current.delete(peerId);
      syncPeers();
      onPeerLeftRef.current?.(peerId);
    });

    // Relay signaling data (SDP offers/answers, ICE candidates)
    socket.on('signal', ({ from, payload }) => {
      onSignalRef.current?.(from, payload);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [syncPeers]);

  return {
    socketRef,
    peers,
    roomId,
    connectionStatus,
    joinRoom,
    leaveRoom,
    sendSignal,
    onPeerJoinedRef,
    onPeerLeftRef,
    onSignalRef,
  };
}
