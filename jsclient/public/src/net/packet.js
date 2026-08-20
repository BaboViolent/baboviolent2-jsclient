// BaboNet frame codec — cPacket.h (4-byte LE header + payload).
import { NET } from './protocol.js';

export { NET };

export const WIRE_POSITION_SCALE = 100;
export const WIRE_VELOCITY_SCALE = 10;

/** @typedef {{ typeId: number, payload: Uint8Array }} NetFrame */

/** @returns {NetFrame | null} null if buffer incomplete */
export function decodeFrame(buffer) {
  if (buffer.byteLength < 4) return null;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const payloadSize = view.getUint16(0, true);
  const typeId = view.getUint16(2, true);
  const total = 4 + payloadSize;
  if (buffer.byteLength < total) return null;
  return {
    typeId,
    payload: buffer.slice(4, total),
  };
}

/** Consume all complete frames; returns remaining bytes buffer. */
export function drainFrames(buffer, onFrame) {
  let offset = 0;
  while (offset + 4 <= buffer.length) {
    const view = new DataView(buffer.buffer, buffer.byteOffset + offset, buffer.length - offset);
    const payloadSize = view.getUint16(0, true);
    const total = 4 + payloadSize;
    if (offset + total > buffer.length) break;
    const typeId = view.getUint16(2, true);
    const payload = buffer.slice(offset + 4, offset + total);
    onFrame(typeId, payload);
    offset += total;
  }
  return offset > 0 ? buffer.slice(offset) : buffer;
}

export function encodeFrame(typeId, payload = new Uint8Array(0)) {
  const size = Math.min(payload.length, 0xffff);
  const out = new Uint8Array(4 + size);
  const view = new DataView(out.buffer);
  view.setUint16(0, size, true);
  view.setUint16(2, typeId, true);
  out.set(payload.subarray(0, size), 4);
  return out;
}

export function encodeEmpty(typeId) {
  return encodeFrame(typeId, new Uint8Array(0));
}

export function writeFixedStr16(str) {
  const out = new Uint8Array(16);
  const bytes = new TextEncoder().encode(str);
  out.set(bytes.subarray(0, 15));
  return out;
}

export function readFixedStr(bytes, off, len) {
  let end = off + len;
  for (let i = off; i < off + len && i < bytes.length; i++) {
    if (bytes[i] === 0) {
      end = i;
      break;
    }
  }
  return new TextDecoder().decode(bytes.subarray(off, end));
}

export function gameVersionAccepted(playerId, password = '') {
  const p = new Uint8Array(17);
  p[0] = playerId & 0xff;
  const pass = new TextEncoder().encode(password);
  p.set(pass.subarray(0, 15), 1);
  return encodeFrame(NET.CLSV_GAMEVERSION_ACCEPTED, p);
}

export function playerInfo(playerId, name, username = '', password = '') {
  // Native gcc ABI: id@0, ip@1, name@17, username@49, password@70, mac@102; sizeof=122.
  const p = new Uint8Array(122);
  p[0] = playerId & 0xff;
  const enc = new TextEncoder();
  p.set(enc.encode(name).subarray(0, 31), 17);
  p.set(enc.encode(username).subarray(0, 20), 49);
  p.set(enc.encode(password).subarray(0, 31), 70);
  return encodeFrame(NET.CLSV_SVCL_PLAYER_INFO, p);
}

export function spawnRequest(playerId, weaponId, meleeId, skin = 'skin10', decals = null) {
  const p = new Uint8Array(19);
  p[0] = playerId & 0xff;
  p[1] = weaponId & 0xff;
  p[2] = meleeId & 0xff;
  const enc = new TextEncoder();
  p.set(enc.encode(skin).subarray(0, 6), 3);
  const d = decals ?? { r: [255, 255, 255], g: [255, 255, 255], b: [255, 255, 255] };
  p.set(d.r, 10);
  p.set(d.g, 13);
  p.set(d.b, 16);
  return encodeFrame(NET.CLSV_SPAWN_REQUEST, p);
}

export function teamRequest(playerId, teamId) {
  const p = new Uint8Array(2);
  p[0] = playerId & 0xff;
  p[1] = teamId & 0xff;
  return encodeFrame(NET.CLSV_SVCL_TEAM_REQUEST, p);
}

export function playerChangeName(playerId, name) {
  const p = new Uint8Array(33);
  p[0] = playerId & 0xff;
  p.set(new TextEncoder().encode(name).subarray(0, 31), 1);
  return encodeFrame(NET.CLSV_SVCL_PLAYER_CHANGE_NAME, p);
}

export function playerUpdateSkin(playerId, skin = 'skin10', decals = null) {
  const p = new Uint8Array(17);
  p[0] = playerId & 0xff;
  p.set(new TextEncoder().encode(skin).subarray(0, 6), 1);
  const d = decals ?? { r: [255, 255, 255], g: [255, 255, 255], b: [255, 255, 255] };
  p.set(d.r, 8);
  p.set(d.g, 11);
  p.set(d.b, 14);
  return encodeFrame(NET.CLSV_SVCL_PLAYER_UPDATE_SKIN, p);
}

export function parsePlayerChangeName(payload) {
  return { playerID: payload[0], name: readFixedStr(payload, 1, 32) };
}

export function parsePlayerUpdateSkin(payload) {
  return {
    playerID: payload[0],
    skin: readFixedStr(payload, 1, 7),
    decals: {
      red: payload.subarray(8, 11),
      green: payload.subarray(11, 14),
      blue: payload.subarray(14, 17),
    },
  };
}

export function voteRequest(playerId, command) {
  const p = new Uint8Array(81);
  p.set(new TextEncoder().encode(command).subarray(0, 79), 0);
  p[80] = playerId & 0xff;
  return encodeFrame(NET.CLSV_SVCL_VOTE_REQUEST, p);
}

export function voteResponse(playerId, yes) {
  return encodeFrame(NET.CLSV_VOTE, new Uint8Array([yes ? 1 : 0, playerId & 0xff]));
}

export function parseVoteRequest(payload) {
  return { command: readFixedStr(payload, 0, 80), playerID: payload[80] };
}

export function coordFrame(playerId, frameId, pos, vel, mouse, babonetId) {
  const p = new Uint8Array(28);
  const view = new DataView(p.buffer);
  p[0] = playerId & 0xff;
  view.setInt32(4, frameId, true);
  view.setInt16(8, Math.round(pos[0] * WIRE_POSITION_SCALE), true);
  view.setInt16(10, Math.round(pos[1] * WIRE_POSITION_SCALE), true);
  view.setInt16(12, Math.round(pos[2] * WIRE_POSITION_SCALE), true);
  p[14] = Math.round(vel[0] * WIRE_VELOCITY_SCALE) & 0xff;
  p[15] = Math.round(vel[1] * WIRE_VELOCITY_SCALE) & 0xff;
  p[16] = Math.round(vel[2] * WIRE_VELOCITY_SCALE) & 0xff;
  view.setInt16(18, Math.round(mouse[0] * WIRE_POSITION_SCALE), true);
  view.setInt16(20, Math.round(mouse[1] * WIRE_POSITION_SCALE), true);
  view.setInt16(22, Math.round(mouse[2] * WIRE_POSITION_SCALE), true);
  view.setInt32(24, babonetId, true);
  return encodeFrame(NET.CLSV_SVCL_PLAYER_COORD_FRAME, p);
}

export function pong(playerId) {
  return encodeFrame(NET.CLSV_PONG, new Uint8Array([playerId & 0xff]));
}

export const GAME_VERSION_SV = 21000;

const SPAWN_POS_SCALE = 10;

export function parsePlayerEnumState(payload) {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    playerID: payload[0],
    name: readFixedStr(payload, 1, 32),
    teamID: payload[33],
    status: payload[34],
    kills: view.getInt16(35, true),
    deaths: view.getInt16(37, true),
    score: view.getInt16(39, true),
    returns: view.getInt16(41, true),
    flagAttempts: view.getInt16(43, true),
    damageDealt: view.getFloat32(51, true),
    life: view.getFloat32(47, true),
    weaponID: payload[55],
    skin: readFixedStr(payload, 76, 7),
    decals: {
      red: payload.subarray(83, 86),
      green: payload.subarray(86, 89),
      blue: payload.subarray(89, 92),
    },
  };
}

export function parsePlayerSpawn(payload) {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    playerID: payload[0],
    weaponID: payload[1],
    meleeID: payload[2],
    position: [
      view.getInt16(4, true) / SPAWN_POS_SCALE,
      view.getInt16(6, true) / SPAWN_POS_SCALE,
      view.getInt16(8, true) / SPAWN_POS_SCALE,
    ],
    skin: readFixedStr(payload, 10, 7),
    decals: {
      red: payload.subarray(17, 20),
      green: payload.subarray(20, 23),
      blue: payload.subarray(23, 26),
    },
  };
}

export function parseCoordFrame(payload) {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const scale = (i) => view.getInt16(i, true) / WIRE_POSITION_SCALE;
  const vel = (i) => (payload[i] << 24 >> 24) / WIRE_VELOCITY_SCALE;
  return {
    playerID: payload[0],
    frameID: view.getInt32(4, true),
    position: [scale(8), scale(10), scale(12)],
    vel: [vel(14), vel(15), vel(16)],
    mousePos: [scale(18), scale(20), scale(22)],
  };
}

export function playerShoot(playerId, weaponId, nuzzleId, p1, p2) {
  const p = new Uint8Array(16);
  const view = new DataView(p.buffer);
  p[0] = playerId & 0xff;
  p[1] = weaponId & 0xff;
  p[2] = nuzzleId & 0xff;
  view.setInt16(4, Math.round(p1[0] * WIRE_POSITION_SCALE), true);
  view.setInt16(6, Math.round(p1[1] * WIRE_POSITION_SCALE), true);
  view.setInt16(8, Math.round(p1[2] * WIRE_POSITION_SCALE), true);
  view.setInt16(10, Math.round(p2[0] * WIRE_POSITION_SCALE), true);
  view.setInt16(12, Math.round(p2[1] * WIRE_POSITION_SCALE), true);
  view.setInt16(14, Math.round(p2[2] * WIRE_POSITION_SCALE), true);
  return encodeFrame(NET.CLSV_PLAYER_SHOOT, p);
}

let _projUid = 1;

export function playerProjectile(playerId, weaponId, nuzzleId, projectileType, pos, vel, uniqueId = _projUid++) {
  const p = new Uint8Array(24);
  const view = new DataView(p.buffer);
  p[0] = playerId & 0xff;
  p[1] = weaponId & 0xff;
  p[2] = nuzzleId & 0xff;
  p[3] = projectileType & 0xff;
  view.setInt16(4, Math.round(pos[0] * WIRE_POSITION_SCALE), true);
  view.setInt16(6, Math.round(pos[1] * WIRE_POSITION_SCALE), true);
  view.setInt16(8, Math.round(pos[2] * WIRE_POSITION_SCALE), true);
  p[10] = Math.round(vel[0] * WIRE_VELOCITY_SCALE) & 0xff;
  p[11] = Math.round(vel[1] * WIRE_VELOCITY_SCALE) & 0xff;
  p[12] = Math.round(vel[2] * WIRE_VELOCITY_SCALE) & 0xff;
  view.setInt32(13, uniqueId, true);
  return encodeFrame(NET.CLSV_SVCL_PLAYER_PROJECTILE, p);
}

export function shootMelee(playerId) {
  return encodeFrame(NET.CLSV_SVCL_PLAYER_SHOOT_MELEE, new Uint8Array([playerId & 0xff]));
}

export function pickupRequest(playerId, itemType, position, uniqueID = 0) {
  const p = new Uint8Array(10);
  const view = new DataView(p.buffer);
  p[0] = playerId & 0xff;
  p[1] = itemType & 0xff;
  view.setInt16(2, Math.round(position[0] * WIRE_POSITION_SCALE), true);
  view.setInt16(4, Math.round(position[1] * WIRE_POSITION_SCALE), true);
  view.setInt32(6, uniqueID, true);
  return encodeFrame(NET.CLSV_PICKUP_REQUEST, p);
}

/** Client → server authoritative explosion (bv2-server extension, 30 bytes). */
/** Client → server molotov/flame patch tick (bv2-server extension, 18 bytes). */
export function reportBurn(playerId, position, radius, weaponId) {
  const p = new Uint8Array(18);
  const view = new DataView(p.buffer);
  p[0] = playerId & 0xff;
  p[1] = weaponId & 0xff;
  view.setFloat32(2, position[0], true);
  view.setFloat32(6, position[1], true);
  view.setFloat32(10, position[2], true);
  view.setFloat32(14, radius, true);
  return encodeFrame(NET.CLSV_REPORT_BURN, p);
}

export function reportExplosion(playerId, position, normal, radius, weaponId) {
  const p = new Uint8Array(30);
  const view = new DataView(p.buffer);
  p[0] = playerId & 0xff;
  p[1] = weaponId & 0xff;
  view.setFloat32(2, position[0], true);
  view.setFloat32(6, position[1], true);
  view.setFloat32(10, position[2], true);
  view.setFloat32(14, normal[0], true);
  view.setFloat32(18, normal[1], true);
  view.setFloat32(22, normal[2], true);
  view.setFloat32(26, radius, true);
  return encodeFrame(NET.CLSV_REPORT_EXPLOSION, p);
}

export function chatMessage(teamId, message) {
  const p = new Uint8Array(131);
  p[0] = teamId & 0xff;
  const enc = new TextEncoder().encode(message);
  p.set(enc.subarray(0, 129), 1);
  return encodeFrame(NET.CLSV_SVCL_CHAT, p);
}

export function parsePlayerShoot(payload) {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const s = (i) => view.getInt16(i, true) / WIRE_POSITION_SCALE;
  const hit = payload[1];
  return {
    playerID: payload[0],
    hitPlayerID: hit >= 128 ? hit - 256 : hit,
    nuzzleID: payload[2],
    weaponID: payload[3],
    p1: [s(4), s(6), s(8)],
    p2: [s(10), s(12), s(14)],
    normal: [16, 17, 18].map((i) => (payload[i] << 24 >> 24) / 120),
  };
}

export function parsePlayerHit(payload) {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    playerID: payload[0],
    fromID: payload[1] >= 128 ? payload[1] - 256 : payload[1],
    weaponID: payload[2],
    lifeRemaining: view.getFloat32(3, true),
    vel: [
      (payload[7] ?? 0) / 10,
      (payload[8] ?? 0) / 10,
      (payload[9] ?? 1) / 10,
    ],
  };
}

export function parseExplosion(payload) {
  if (payload.byteLength < 29) throw new Error(`NET_SVCL_EXPLOSION payload is ${payload.byteLength} bytes; expected 29`);
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    position: [view.getFloat32(0, true), view.getFloat32(4, true), view.getFloat32(8, true)],
    normal: [view.getFloat32(12, true), view.getFloat32(16, true), view.getFloat32(20, true)],
    radius: view.getFloat32(24, true),
    playerID: payload[28] >= 128 ? payload[28] - 256 : payload[28],
  };
}

export function parseChat(payload) {
  return {
    teamID: payload[0] >= 128 ? payload[0] - 256 : payload[0],
    message: readFixedStr(payload, 1, 130),
  };
}

export function parseSyncTimer(payload) {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    frameID: view.getInt32(0, true),
    gameTimeLeft: view.getFloat32(4, true),
    roundTimeLeft: view.getFloat32(8, true),
  };
}

export function parsePlayerPing(payload) {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return { playerID: payload[0], ping: view.getInt16(1, true) };
}

export function parsePlayerProjectile(payload) {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const s = (i) => view.getInt16(i, true) / WIRE_POSITION_SCALE;
  const vel = (i) => (payload[i] << 24 >> 24) / WIRE_VELOCITY_SCALE;
  return {
    playerID: payload[0],
    weaponID: payload[1],
    nuzzleID: payload[2],
    projectileType: payload[3],
    position: [s(4), s(6), s(8)],
    vel: [vel(10), vel(11), vel(12)],
    uniqueID: view.getInt32(13, true),
  };
}

export function parseProjectileCoordFrame(payload) {
  if (payload.byteLength < 24) throw new Error(`NET_SVCL_PROJECTILE_COORD_FRAME payload is ${payload.byteLength} bytes; expected 24`);
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const pos = (i) => view.getInt16(i, true) / WIRE_POSITION_SCALE;
  const vel = (i) => (payload[i] << 24 >> 24) / WIRE_VELOCITY_SCALE;
  return {
    uniqueID: view.getInt32(0, true),
    frameID: view.getInt32(8, true),
    position: [pos(12), pos(14), pos(16)],
    vel: [vel(18), vel(19), vel(20)],
  };
}
