// Port of the .bvm loader in src/Game/Map.cpp (Map::Map, line ~228).
import { BinaryReader } from '../core/binaryReader.js';
import {
  CONTENT_ROOT, GAME_TYPE_COUNT, GAME_TYPE_CTF, GAME_TYPE_SND, MAP_VERSION,
  THEME_NAMES, weatherFromTheme,
} from './constants.js';

export class BVMap {
  constructor() {
    this.version = 0;
    this.author = '';
    this.theme = 0;
    this.weather = 0;
    this.sizeX = 0;
    this.sizeY = 0;
    /** @type {Uint8Array} bit7 = passable, bits0-6 = height */
    this.cells = new Uint8Array(0);
    /** Dirt value per *vertex*, (sizeX+1) x (sizeY+1), 0..1. See PORTING_PLAN.md §3. */
    this.dirt = new Float32Array(0);
    this.flagPod = [[0, 0, 0], [0, 0, 0]];
    this.objective = [[0, 0, 0], [0, 0, 0]];
    this.dmSpawns = [];
    this.blueSpawns = [];
    this.redSpawns = [];
  }

  get themeName() {
    return THEME_NAMES[this.theme] ?? 'grass';
  }

  cellAt(x, y) {
    if (x < 0 || y < 0 || x >= this.sizeX || y >= this.sizeY) return 0;
    return this.cells[y * this.sizeX + x];
  }

  isPassable(x, y) {
    if (x < 0 || y < 0 || x >= this.sizeX || y >= this.sizeY) return false;
    return (this.cells[y * this.sizeX + x] & 128) !== 0;
  }

  heightAt(x, y) {
    if (x < 0 || y < 0 || x >= this.sizeX || y >= this.sizeY) return 0;
    return this.cells[y * this.sizeX + x] & 127;
  }

  dirtAtVertex(x, y) {
    const w = this.sizeX + 1;
    const cx = Math.min(Math.max(x, 0), this.sizeX);
    const cy = Math.min(Math.max(y, 0), this.sizeY);
    return this.dirt[cy * w + cx];
  }
}

function readTiles(r, map) {
  map.sizeX = r.getInt();
  map.sizeY = r.getInt();
  const count = map.sizeX * map.sizeY;
  if (count <= 0 || count > 4096 * 4096) throw new Error(`bvm: bad size ${map.sizeX}x${map.sizeY}`);

  map.cells = new Uint8Array(count);
  map.dirt = new Float32Array((map.sizeX + 1) * (map.sizeY + 1));
  const dirtStride = map.sizeX + 1;

  for (let y = 0; y < map.sizeY; y++) {
    for (let x = 0; x < map.sizeX; x++) {
      map.cells[y * map.sizeX + x] = r.getUByte();
      map.dirt[y * dirtStride + x] = r.getUByte() / 255;
    }
  }
  // The outer vertex row/column has no byte in the file; mirror the neighbour.
  for (let y = 0; y < map.sizeY; y++) {
    map.dirt[y * dirtStride + map.sizeX] = map.dirt[y * dirtStride + map.sizeX - 1];
  }
  for (let x = 0; x <= map.sizeX; x++) {
    map.dirt[map.sizeY * dirtStride + x] = map.dirt[(map.sizeY - 1) * dirtStride + x];
  }
}

function readSpawnList(r) {
  const n = r.getInt();
  const out = [];
  for (let i = 0; i < n; i++) out.push(r.getVector3f());
  return out;
}

export function parseBVM(arrayBuffer) {
  const r = new BinaryReader(arrayBuffer);
  const map = new BVMap();
  map.version = r.getULong();

  switch (map.version) {
    case 10010:
      readTiles(r, map);
      break;

    case 10011:
      readTiles(r, map);
      map.flagPod = [r.getVector3f(), r.getVector3f()];
      map.objective = [r.getVector3f(), r.getVector3f()];
      map.dmSpawns = readSpawnList(r);
      map.blueSpawns = readSpawnList(r);
      map.redSpawns = readSpawnList(r);
      break;

    case 20201:
      map.theme = r.getInt();
      map.weather = r.getInt();
      readTiles(r, map);
      map.flagPod = [r.getVector3f(), r.getVector3f()];
      map.objective = [r.getVector3f(), r.getVector3f()];
      map.dmSpawns = readSpawnList(r);
      map.blueSpawns = readSpawnList(r);
      map.redSpawns = readSpawnList(r);
      break;

    case 20202: {
      map.author = r.getFixedString(25);
      map.theme = r.getInt();
      map.weather = r.getInt();
      readTiles(r, map);
      map.dmSpawns = readSpawnList(r);
      // One section per supported game type, in file order.
      for (let i = 0; i < GAME_TYPE_COUNT; i++) {
        const id = r.getInt();
        if (id === GAME_TYPE_CTF) {
          map.flagPod = [r.getVector3f(), r.getVector3f()];
        } else if (id === GAME_TYPE_SND) {
          map.objective = [r.getVector3f(), r.getVector3f()];
          map.blueSpawns = readSpawnList(r);
          map.redSpawns = readSpawnList(r);
        }
      }
      break;
    }

    default:
      throw new Error(`bvm: unknown map version ${map.version}`);
  }

  return map;
}

class BinaryWriter {
  constructor(size) {
    this.buffer = new ArrayBuffer(size);
    this.view = new DataView(this.buffer);
    this.bytes = new Uint8Array(this.buffer);
    this.offset = 0;
  }

  ulong(v) { this.view.setUint32(this.offset, v, true); this.offset += 4; }
  int(v) { this.view.setInt16(this.offset, v, true); this.offset += 2; }
  byte(v) { this.view.setUint8(this.offset++, v); }
  float(v) { this.view.setFloat32(this.offset, Number(v) || 0, true); this.offset += 4; }
  vector(v) { this.float(v?.[0]); this.float(v?.[1]); this.float(v?.[2]); }
  fixedString(value, size) {
    const text = String(value ?? '');
    for (let i = 0; i < size; i++) this.byte(i < text.length ? text.charCodeAt(i) & 0xff : 0);
  }
}

const spawnBytes = (list) => 2 + list.length * 12;

/** Write the latest native editor format (Map::save, version 20202). */
export function serializeBVM(map) {
  const cellCount = map.sizeX * map.sizeY;
  if (map.sizeX <= 0 || map.sizeY <= 0 || map.cells.length !== cellCount) {
    throw new Error(`bvm: invalid editor grid ${map.sizeX}x${map.sizeY}`);
  }
  if (map.sizeX > 4096 || map.sizeY > 4096) throw new Error('bvm: editor grid too large');
  const size = 4 + 25 + 2 + 2 + 2 + 2 + cellCount * 2
    + spawnBytes(map.dmSpawns) + 2 * GAME_TYPE_COUNT
    + 24 + 24 + spawnBytes(map.blueSpawns) + spawnBytes(map.redSpawns);
  const w = new BinaryWriter(size);
  w.ulong(MAP_VERSION);
  w.fixedString(map.author, 25);
  w.int(map.theme ?? 0);
  w.int(weatherFromTheme(map.theme ?? 0));
  w.int(map.sizeX);
  w.int(map.sizeY);
  const dirtStride = map.sizeX + 1;
  for (let y = 0; y < map.sizeY; y++) {
    for (let x = 0; x < map.sizeX; x++) {
      const index = y * map.sizeX + x;
      w.byte(map.cells[index]);
      w.byte(Math.round(Math.min(1, Math.max(0, map.dirt[y * dirtStride + x] ?? 0)) * 255));
    }
  }
  const spawns = (list) => {
    w.int(list.length);
    for (const point of list) w.vector(point);
  };
  spawns(map.dmSpawns);
  for (let id = 0; id < GAME_TYPE_COUNT; id++) {
    w.int(id);
    if (id === GAME_TYPE_CTF) {
      w.vector(map.flagPod[0]);
      w.vector(map.flagPod[1]);
    } else if (id === GAME_TYPE_SND) {
      w.vector(map.objective[0]);
      w.vector(map.objective[1]);
      spawns(map.blueSpawns);
      spawns(map.redSpawns);
    }
  }
  return w.buffer;
}

export function createEditorMap(width, height, { author = '', name = 'newmap', theme = 0 } = {}) {
  const map = new BVMap();
  map.version = MAP_VERSION;
  map.author = author;
  map.name = name;
  map.theme = theme;
  map.weather = weatherFromTheme(theme);
  map.sizeX = width;
  map.sizeY = height;
  map.cells = new Uint8Array(width * height).fill(0x80);
  map.dirt = new Float32Array((width + 1) * (height + 1));
  return map;
}

export async function loadMap(name) {
  const file = name.toLowerCase().endsWith('.bvm') ? name : `${name}.bvm`;
  const res = await fetch(`${CONTENT_ROOT}/main/maps/${file}`);
  if (!res.ok) throw new Error(`map ${file}: HTTP ${res.status}`);
  const map = parseBVM(await res.arrayBuffer());
  map.name = file.replace(/\.bvm$/i, '');
  return map;
}
