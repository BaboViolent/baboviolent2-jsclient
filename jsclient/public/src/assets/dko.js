// Loader for the Zeven engine's .DKO model format.
// Ported from src/Engine/dko/ (CdkoModel.cpp, CdkoMesh.cpp, CdkoMaterial.cpp);
// chunk ids are documented in src/Engine/dko/"DKO Chunk Info.txt".
//
// Chunks are a bare 2-byte id with NO length field, so every chunk type must be
// parsed explicitly - an unknown id desynchronises the whole stream.
import { BinaryReader } from '../core/binaryReader.js';

const CHUNK = {
  VERSION: 0x0000,
  TIME_INFO: 0x0001,
  PROPERTIES: 0x0100,
  NAME: 0x0110,
  POSITION: 0x0120,
  MATRIX: 0x0130,
  MATLIST: 0x0200,
  MATNAME: 0x0210,
  TEX_DKT: 0x0220,
  AMBIENT: 0x0230,
  DIFFUSE: 0x0240,
  SPECULAR: 0x0250,
  EMISSIVE: 0x0260,
  SHININESS: 0x0270,
  TRANSPARENCY: 0x0280,
  TWO_SIDED: 0x0290,
  WIRE_FRAME: 0x02a0,
  WIRE_WIDTH: 0x02b0,
  TEX_DIFFUSE: 0x02c0,
  TEX_BUMP: 0x02d0,
  TEX_SPECULAR: 0x02e0,
  TEX_SELFILL: 0x02f0,
  TRI_MESH: 0x0300,
  NB_MAT_GROUP: 0x0340,
  MAT_ID: 0x0341,
  NB_VERTEX: 0x0342,
  VERTEX_ARRAY: 0x0343,
  NORMAL_ARRAY: 0x0344,
  TEXCOORD_ARRAY: 0x0345,
  TEXCOORD_ARRAY_ANIM: 0x0346,
  DUMMY: 0x0400,
  END: 0x0900,
};

const MAX_VERTEX = 1 << 22;

function readCString(r) {
  const start = r.offset;
  while (r.getUByte() !== 0);
  return new TextDecoder('latin1').decode(r.bytes.subarray(start, r.offset - 1));
}

function readFloats(r, n) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = r.getFloat();
  return out;
}

function loadMaterial(r) {
  const mat = { name: '', texDiffuse: null, diffuse: [1, 1, 1, 1], transparency: 0, twoSided: false };
  for (let id = r.getShort(); id !== CHUNK.END; id = r.getShort()) {
    switch (id) {
      case CHUNK.MATNAME: mat.name = readCString(r); break;
      case CHUNK.TEX_DKT: mat.texDkt = readCString(r); break;
      case CHUNK.TEX_DIFFUSE: mat.texDiffuse = readCString(r); break;
      case CHUNK.TEX_BUMP: mat.texBump = readCString(r); break;
      case CHUNK.TEX_SPECULAR: mat.texSpecular = readCString(r); break;
      case CHUNK.TEX_SELFILL: mat.texSelfIll = readCString(r); break;
      case CHUNK.AMBIENT: mat.ambient = readFloats(r, 4); break;
      case CHUNK.DIFFUSE: mat.diffuse = readFloats(r, 4); break;
      case CHUNK.SPECULAR: mat.specular = readFloats(r, 4); break;
      case CHUNK.EMISSIVE: mat.emissive = readFloats(r, 4); break;
      case CHUNK.SHININESS: mat.shininess = r.getShort(); break;
      case CHUNK.TRANSPARENCY: mat.transparency = r.getFloat(); break;
      case CHUNK.TWO_SIDED: mat.twoSided = r.getByte() !== 0; break;
      case CHUNK.WIRE_FRAME: mat.wire = r.getByte() !== 0; break;
      case CHUNK.WIRE_WIDTH: mat.wireSize = r.getFloat(); break;
      default: throw new Error(`dko: unknown material chunk 0x${id.toString(16)}`);
    }
  }
  return mat;
}

function loadMatGroup(r, frameCount) {
  const group = { materialID: 0, nbVertex: 0, vertices: null, normals: null, uvs: null };
  for (let id = r.getShort(); id !== CHUNK.END; id = r.getShort()) {
    switch (id) {
      case CHUNK.MAT_ID:
        group.materialID = r.getShort();
        break;
      case CHUNK.NB_VERTEX:
        group.nbVertex = r.getLong();
        if (group.nbVertex < 0 || group.nbVertex > MAX_VERTEX) throw new Error('dko: bad vertex count');
        break;
      case CHUNK.VERTEX_ARRAY: {
        group.vertexFrames = [];
        for (let f = 0; f < frameCount; f++) {
          group.vertexFrames.push(readFloats(r, group.nbVertex * 3));
        }
        group.vertices = group.vertexFrames[0];
        break;
      }
      case CHUNK.NORMAL_ARRAY: {
        group.normalFrames = [];
        for (let f = 0; f < frameCount; f++) {
          group.normalFrames.push(readFloats(r, group.nbVertex * 3));
        }
        group.normals = group.normalFrames[0];
        break;
      }
      case CHUNK.TEXCOORD_ARRAY:
        group.uvs = readFloats(r, group.nbVertex * 2);
        break;
      case CHUNK.TEXCOORD_ARRAY_ANIM:
        for (let f = 0; f < frameCount; f++) {
          const arr = readFloats(r, group.nbVertex * 2);
          if (f === 0) group.uvs = arr;
        }
        break;
      default:
        throw new Error(`dko: unknown matgroup chunk 0x${id.toString(16)}`);
    }
  }
  return group;
}

function loadMesh(r, frameCount) {
  const mesh = { name: '', position: [0, 0, 0], matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], groups: [] };
  for (let id = r.getShort(); id !== CHUNK.END; id = r.getShort()) {
    switch (id) {
      case CHUNK.NAME: mesh.name = readCString(r); break;
      case CHUNK.POSITION: mesh.position = readFloats(r, 3); break;
      case CHUNK.MATRIX: mesh.matrix = readFloats(r, 9); break;
      case CHUNK.NB_MAT_GROUP: {
        const n = r.getShort();
        for (let i = 0; i < n; i++) mesh.groups.push(loadMatGroup(r, frameCount));
        break;
      }
      default:
        throw new Error(`dko: unknown mesh chunk 0x${id.toString(16)}`);
    }
  }
  return mesh;
}

function loadProperties(r, into) {
  for (let id = r.getShort(); id !== CHUNK.END; id = r.getShort()) {
    switch (id) {
      case CHUNK.NAME: into.name = readCString(r); break;
      case CHUNK.POSITION: into.position = readFloats(r, 3); break;
      case CHUNK.MATRIX: into.matrix = readFloats(r, 9); break;
      default: throw new Error(`dko: unknown property chunk 0x${id.toString(16)}`);
    }
  }
}

function loadDummy(r, frameCount) {
  const dummy = { name: '', positions: [], matrices: [] };
  for (let id = r.getShort(); id !== CHUNK.END; id = r.getShort()) {
    switch (id) {
      case CHUNK.NAME: dummy.name = readCString(r); break;
      case CHUNK.POSITION:
        for (let f = 0; f < frameCount; f++) dummy.positions.push(readFloats(r, 3));
        break;
      case CHUNK.MATRIX:
        for (let f = 0; f < frameCount; f++) dummy.matrices.push(readFloats(r, 9));
        break;
      default: throw new Error(`dko: unknown dummy chunk 0x${id.toString(16)}`);
    }
  }
  return dummy;
}

export function parseDKO(arrayBuffer) {
  const r = new BinaryReader(arrayBuffer);
  const model = {
    version: 0,
    timeInfo: [0, 0, 1],
    name: '',
    position: [0, 0, 0],
    matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    materials: [],
    meshes: [],
    dummies: [],
  };

  for (let id = r.getShort(); id !== CHUNK.END; id = r.getShort()) {
    switch (id) {
      case CHUNK.VERSION:
        model.version = r.getShort();
        break;
      case CHUNK.TIME_INFO:
        model.timeInfo = [r.getShort(), r.getShort(), r.getShort()];
        break;
      case CHUNK.PROPERTIES:
        loadProperties(r, model);
        break;
      case CHUNK.MATLIST: {
        const nbMat = r.getShort();
        // Materials are stored last-first: CdkoModel fills materialArray[nbMat-i-1].
        const mats = new Array(nbMat);
        for (let i = 0; i < nbMat; i++) mats[nbMat - i - 1] = loadMaterial(r);
        model.materials = mats;
        break;
      }
      case CHUNK.TRI_MESH:
        model.meshes.push(loadMesh(r, model.timeInfo[2]));
        break;
      case CHUNK.DUMMY:
        model.dummies.push(loadDummy(r, model.timeInfo[2]));
        break;
      default:
        throw new Error(`dko: unknown chunk 0x${id.toString(16)} at ${r.offset - 2}`);
    }
  }

  return model;
}
