import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { RoomManager } from './rooms.js';

const app = express();
const httpServer = createServer(app);
const allowedOrigins = (process.env.CLIENT_ORIGIN || '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
    methods: ['GET', 'POST'],
  },
  transports: ['websocket'],
});

const rooms = new RoomManager();

app.get('/health', (_, res) => res.json({ status: 'ok', rooms: rooms.size() }));

io.on('connection', (socket) => {
  console.log(`[+] Peer connected: ${socket.id}`);

  socket.on('join-room', ({ roomId, peerId, gpuCapable, role }) => {
    const existingPeers = rooms.join(roomId, peerId, socket.id, gpuCapable, role);

    // Send existing peers to the new joiner
    socket.emit('room-peers', existingPeers);

    // Notify existing peers of the new joiner
    socket.to(roomId).emit('peer-joined', { peerId, gpuCapable, role });

    socket.join(roomId);
    socket.data = { roomId, peerId, role };
    console.log(`[room:${roomId}] ${peerId} joined. Total: ${existingPeers.length + 1}`);
  });

  // Pure relay — server never inspects the SDP/ICE payload
  socket.on('signal', ({ to, payload }) => {
    const targetSocketId = rooms.getSocketId(socket.data.roomId, to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('signal', {
        from: socket.data.peerId,
        payload,
      });
    }
  });

  socket.on('disconnect', () => {
    const { roomId, peerId } = socket.data ?? {};
    if (roomId && peerId) {
      rooms.leave(roomId, peerId);
      socket.to(roomId).emit('peer-left', { peerId });
      console.log(`[-] ${peerId} left room ${roomId}`);
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Signaling server on :${PORT}`);
});
