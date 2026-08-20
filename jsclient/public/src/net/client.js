// WebSocket client for bv2-server (Phase 4).
import { NET } from './protocol.js';
import {
  decodeFrame, drainFrames, gameVersionAccepted, playerInfo, spawnRequest,
  teamRequest, coordFrame, pong, readFixedStr, GAME_VERSION_SV,
  playerShoot, playerProjectile, shootMelee, pickupRequest, reportExplosion, reportBurn, chatMessage,
  voteRequest, voteResponse,
} from './packet.js';
import { wireDecalsFromFloats } from '../game/skin.js';

/** Native C++ player status (Player.h) — differs from local explore constants. */
export const NET_PLAYER_STATUS_ALIVE = 0;
export const NET_PLAYER_STATUS_DEAD = 1;
export const NET_PLAYER_STATUS_LOADING = 2;

export class Bv2Client {
  /** @param {{ url?: string, name?: string, password?: string, onPacket?: (typeId: number, payload: Uint8Array) => void, onConnect?: () => void, onDisconnect?: () => void }} opts */
  constructor(opts = {}) {
    this.url = opts.url ?? `ws://${location.hostname}:8080/ws`;
    this.name = opts.name ?? 'Babo';
    this.password = opts.password ?? '';
    this.onPacket = opts.onPacket ?? (() => {});
    this.onConnect = opts.onConnect ?? (() => {});
    this.onDisconnect = opts.onDisconnect ?? (() => {});

    /** @type {WebSocket | null} */
    this.ws = null;
    this.playerId = -1;
    this.babonetId = 0;
    this.connected = false;
    this._rx = new Uint8Array(0);
    this._frameId = 0;
  }

  connect() {
    if (this.ws) this.disconnect();
    this.ws = new WebSocket(this.url);
    this.ws.binaryType = 'arraybuffer';
    this.ws.addEventListener('open', () => {
      this.connected = true;
      this.onConnect();
    });
    this.ws.addEventListener('close', () => {
      this.connected = false;
      this.onDisconnect();
    });
    this.ws.addEventListener('message', (ev) => {
      if (!(ev.data instanceof ArrayBuffer)) return;
      const chunk = new Uint8Array(ev.data);
      const merged = new Uint8Array(this._rx.length + chunk.length);
      merged.set(this._rx);
      merged.set(chunk, this._rx.length);
      this._rx = merged;
      this._rx = drainFrames(this._rx, (typeId, payload) => this._dispatch(typeId, payload));
    });
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.connected = false;
    this.playerId = -1;
  }

  send(data) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(data);
  }

  _dispatch(typeId, payload) {
    switch (typeId) {
      case NET.SVCL_NEWPLAYER: {
        const pid = payload[0];
        const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
        const babonetId = view.getInt32(4, true);
        // Server broadcasts NEWPLAYER to everyone; only the joining client should handshake.
        if (this.playerId < 0) {
          this.playerId = pid;
          this.babonetId = babonetId;
          this.send(gameVersionAccepted(this.playerId, this.password));
        }
        break;
      }
      case NET.SVCL_GAMEVERSION: {
        const ver = new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint32(0, true);
        if (ver !== GAME_VERSION_SV) {
          console.warn('server version mismatch', ver, 'expected', GAME_VERSION_SV);
        }
        this.send(playerInfo(this.playerId, this.name));
        break;
      }
      case NET.SVCL_PING:
        this.send(pong(payload[0]));
        break;
      default:
        break;
    }
    this.onPacket(typeId, payload);
  }

  requestTeam(teamId) {
    if (this.playerId < 0) return;
    this.send(teamRequest(this.playerId, teamId));
  }

  requestSpawn(weaponId, meleeId, skin, decals) {
    if (this.playerId < 0) return;
    const wireDecals = decals ? wireDecalsFromFloats(decals) : null;
    this.send(spawnRequest(this.playerId, weaponId, meleeId, skin, wireDecals));
  }

  sendCoordFrame(game, player) {
    if (this.playerId < 0 || !this.connected) return;
    this._frameId++;
    const p = player.currentCF.position;
    const v = player.currentCF.vel ?? [0, 0, 0];
    const m = player.mousePosOnMap ?? player.currentCF.position;
    this.send(coordFrame(this.playerId, this._frameId, p, v, m, this.babonetId));
  }

  sendShoot(weaponId, nuzzleId, p1, p2) {
    if (this.playerId < 0) return;
    this.send(playerShoot(this.playerId, weaponId, nuzzleId, p1, p2));
  }

  sendProjectile(weaponId, nuzzleId, projectileType, pos, vel) {
    if (this.playerId < 0) return;
    this.send(playerProjectile(this.playerId, weaponId, nuzzleId, projectileType, pos, vel));
  }

  sendMelee() {
    if (this.playerId < 0) return;
    this.send(shootMelee(this.playerId));
  }

  requestPickup(itemType, position, uniqueID) {
    if (this.playerId < 0) return;
    this.send(pickupRequest(this.playerId, itemType, position, uniqueID));
  }

  sendExplosion(position, normal, radius, weaponId) {
    if (this.playerId < 0) return;
    this.send(reportExplosion(this.playerId, position, normal, radius, weaponId));
  }

  sendBurn(position, radius, weaponId) {
    if (this.playerId < 0) return;
    this.send(reportBurn(this.playerId, position, radius, weaponId));
  }

  sendChat(teamId, message) {
    if (this.playerId < 0) return;
    this.send(chatMessage(teamId, message));
  }

  requestVote(command) {
    if (this.playerId < 0) return;
    this.send(voteRequest(this.playerId, command));
  }

  castVote(yes) {
    if (this.playerId < 0) return;
    this.send(voteResponse(this.playerId, yes));
  }

  /** Parse NET_SVCL_SERVER_INFO for HUD. */
  static parseServerInfo(payload) {
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    return {
      mapSeed: view.getInt32(0, true),
      mapName: readFixedStr(payload, 4, 16),
      gameType: view.getInt8(20),
      blueScore: view.getInt16(21, true),
      redScore: view.getInt16(23, true),
      blueWin: view.getInt16(25, true),
      redWin: view.getInt16(27, true),
    };
  }
}
