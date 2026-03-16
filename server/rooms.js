export class RoomManager {
  #rooms = new Map(); // roomId → Map<peerId, { socketId, gpuCapable, role, joinedAt }>

  join(roomId, peerId, socketId, gpuCapable, role) {
    if (!this.#rooms.has(roomId)) this.#rooms.set(roomId, new Map());
    const room = this.#rooms.get(roomId);
    const existing = [...room.entries()].map(([id, meta]) => ({ peerId: id, ...meta }));
    room.set(peerId, { socketId, gpuCapable, role, joinedAt: Date.now() });
    return existing;
  }

  leave(roomId, peerId) {
    this.#rooms.get(roomId)?.delete(peerId);
    if (this.#rooms.get(roomId)?.size === 0) this.#rooms.delete(roomId);
  }

  getSocketId(roomId, peerId) {
    return this.#rooms.get(roomId)?.get(peerId)?.socketId ?? null;
  }

  size() {
    return this.#rooms.size;
  }
}
