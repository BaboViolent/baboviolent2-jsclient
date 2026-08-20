import { NET } from './protocol.js';

const MAX_RELIABLE_PACKETS = 512;
const MAX_RELIABLE_BYTES = 1024 * 1024;

/** Bounded map-load queue. Replaceable snapshots are newest-wins per entity. */
export class DeferredPacketQueue {
  constructor() { this.reset(); }

  reset() {
    this.reliable = [];
    this.reliableBytes = 0;
    this.playerSnapshots = new Map();
    this.projectileSnapshots = new Map();
  }

  enqueue(typeId, payload) {
    const copy = new Uint8Array(payload);
    if (typeId === NET.CLSV_SVCL_PLAYER_COORD_FRAME && copy.length >= 1) {
      this.playerSnapshots.set(copy[0], [typeId, copy]);
      return true;
    }
    if (typeId === NET.SVCL_PROJECTILE_COORD_FRAME && copy.length >= 4) {
      const id = new DataView(copy.buffer, copy.byteOffset, copy.byteLength).getInt32(0, true);
      this.projectileSnapshots.set(id, [typeId, copy]);
      return true;
    }
    if (typeId === NET.SVCL_PLAYER_DISCONNECT && copy.length >= 1) {
      this.playerSnapshots.delete(copy[0]);
    } else if (typeId === NET.SVCL_DELETE_PROJECTILE && copy.length >= 4) {
      const id = new DataView(copy.buffer, copy.byteOffset, copy.byteLength).getInt32(0, true);
      this.projectileSnapshots.delete(id);
    }
    if (this.reliable.length >= MAX_RELIABLE_PACKETS
      || this.reliableBytes + copy.byteLength > MAX_RELIABLE_BYTES) return false;
    this.reliable.push([typeId, copy]);
    this.reliableBytes += copy.byteLength + 4;
    return true;
  }

  drain() {
    const packets = [
      ...this.reliable,
      ...this.playerSnapshots.values(),
      ...this.projectileSnapshots.values(),
    ];
    this.reset();
    return packets;
  }
}
