// Turns a parsed .DKO into GPU batches. DKO stores a triangle soup per
// material group, already in mesh-local space; mesh position/matrix are folded
// into the vertices at build time since the models here are static props.
import { parseDKO } from '../assets/dko.js';
import { CONTENT_ROOT } from '../game/constants.js';

function transform(mat, pos, v) {
  // Columns of the DKO matrix are right / front / up.
  return [
    mat[0] * v[0] + mat[3] * v[1] + mat[6] * v[2] + pos[0],
    mat[1] * v[0] + mat[4] * v[1] + mat[7] * v[2] + pos[1],
    mat[2] * v[0] + mat[5] * v[1] + mat[8] * v[2] + pos[2],
  ];
}

function rotate(mat, v) {
  return [
    mat[0] * v[0] + mat[3] * v[1] + mat[6] * v[2],
    mat[1] * v[0] + mat[4] * v[1] + mat[7] * v[2],
    mat[2] * v[0] + mat[5] * v[1] + mat[8] * v[2],
  ];
}

/**
 * @returns {{batches:{material:object,data:Float32Array,count:number}[], dummies:object[]}}
 *          Vertex layout: x,y,z, nx,ny,nz, u,v
 */
export function buildModelBatches(model, frameIndex = 0) {
  const byMaterial = new Map();

  for (const mesh of model.meshes) {
    for (const group of mesh.groups) {
      if (!group.nbVertex) continue;
      const vertices = group.vertexFrames?.[frameIndex] ?? group.vertices;
      if (!vertices) continue;
      const normals = group.normalFrames?.[frameIndex] ?? group.normals;
      const key = group.materialID;
      if (!byMaterial.has(key)) byMaterial.set(key, []);
      const out = byMaterial.get(key);
      for (let i = 0; i < group.nbVertex; i++) {
        const p = transform(mesh.matrix, mesh.position, [
          vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2],
        ]);
        const n = normals
          ? rotate(mesh.matrix, [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]])
          : [0, 0, 1];
        out.push(
          p[0], p[1], p[2],
          n[0], n[1], n[2],
          group.uvs ? group.uvs[i * 2] : 0,
          group.uvs ? 1 - group.uvs[i * 2 + 1] : 0,
        );
      }
    }
  }

  const batches = [];
  for (const [materialID, data] of byMaterial) {
    batches.push({
      material: model.materials[materialID] ?? { diffuse: [1, 1, 1, 1] },
      data: new Float32Array(data),
      count: data.length / 8,
    });
  }
  return { batches, dummies: model.dummies };
}

export async function loadModel(relPath) {
  const res = await fetch(`${CONTENT_ROOT}/${relPath}`);
  if (!res.ok) throw new Error(`${relPath}: HTTP ${res.status}`);
  const model = parseDKO(await res.arrayBuffer());
  const frameCount = Math.max(1, model.timeInfo?.[2] ?? 1);
  const frames = [];
  for (let f = 0; f < frameCount; f++) {
    frames.push(buildModelBatches(model, f));
  }
  return { model, frameCount, frames, dummies: model.dummies };
}

/** Dummy lookup by name, e.g. "flash1" / "eject1" (Weapon::loadModels). */
export function getDummy(model, name) {
  return model.dummies.find((d) => d.name === name) ?? null;
}
