// Port of Map::rayTest / Map::rayTileTest (src/Game/Map.cpp:1447, Map.h:415).
// Walks the tile grid along the dominant axis, testing three tiles per step.

const DIR_X = 0;
const DIR_X_NEG = 1;
const DIR_Y = 2;
const DIR_Y_NEG = 3;

function lerp(p1, p2, t) {
  return [
    p1[0] + (p2[0] - p1[0]) * t,
    p1[1] + (p2[1] - p1[1]) * t,
    p1[2] + (p2[2] - p1[2]) * t,
  ];
}

/** Mutates `p2` to the hit point on success, like the C++ does. */
function rayTileTest(map, x, y, p1, p2, out) {
  if (x < 0 || y < 0 || x >= map.sizeX || y >= map.sizeY) return false;

  const x1 = x;
  const x2 = x + 1;
  const y1 = y;
  const y2 = y + 1;
  const height = map.heightAt(x, y);
  const passable = map.isPassable(x, y);
  let p;

  if (passable) {
    // Passable tiles can only be hit on the floor plane.
    if (p1[2] > 0 && p2[2] <= 0) {
      p = lerp(p1, p2, p1[2] / Math.abs(p2[2] - p1[2]));
      if (p[0] >= x1 && p[0] <= x2 && p[1] >= y1 && p[1] <= y2) {
        p2[0] = p[0]; p2[1] = p[1]; p2[2] = p[2];
        out.normal = [0, 0, 1];
        return true;
      }
    }
    return false;
  }

  // Ceiling of a solid block
  if (p1[2] > height && p2[2] <= height) {
    p = lerp(p1, p2, (p1[2] - height) / Math.abs((p2[2] - height) - (p1[2] - height)));
    if (p[0] >= x1 && p[0] <= x2 && p[1] >= y1 && p[1] <= y2) {
      p2[0] = p[0]; p2[1] = p[1]; p2[2] = p[2];
      out.normal = [0, 0, 1];
      return true;
    }
  }

  const sides = [
    [p1[0] <= x1 && p2[0] > x1, () => Math.abs(x1 - p1[0]) / Math.abs(p2[0] - p1[0]), 1, [-1, 0, 0]],
    [p1[0] >= x2 && p2[0] < x2, () => Math.abs(p1[0] - x2) / Math.abs(p2[0] - p1[0]), 1, [1, 0, 0]],
    [p1[1] <= y1 && p2[1] > y1, () => Math.abs(y1 - p1[1]) / Math.abs(p2[1] - p1[1]), 0, [0, -1, 0]],
    [p1[1] >= y2 && p2[1] < y2, () => Math.abs(p1[1] - y2) / Math.abs(p2[1] - p1[1]), 0, [0, 1, 0]],
  ];

  for (const [enter, percent, axis, normal] of sides) {
    if (!enter) continue;
    p = lerp(p1, p2, percent());
    const lo = axis === 1 ? y1 : x1;
    const hi = axis === 1 ? y2 : x2;
    if (p[axis] <= hi && p[axis] >= lo && p[2] < height) {
      p2[0] = p[0]; p2[1] = p[1]; p2[2] = p[2];
      out.normal = normal;
      return true;
    }
  }

  return false;
}

/**
 * @returns {{hit:boolean, point:number[], normal:number[]}} point is the ray end
 *          (clipped to the impact when it hits).
 */
export function rayTest(map, from, to) {
  const p1 = [from[0], from[1], from[2]];
  const p2 = [to[0], to[1], to[2]];
  const out = { normal: [0, 0, 1] };

  let i = Math.floor(p1[0]);
  let j = Math.floor(p1[1]);
  if (i < 0 || i >= map.sizeX || j < 0 || j >= map.sizeY) {
    return { hit: false, point: p2, normal: out.normal };
  }
  // Starting inside a wall counts as an immediate hit.
  if (!map.isPassable(i, j) && p1[2] < map.heightAt(i, j)) {
    return { hit: true, point: p1, normal: out.normal };
  }

  let dir;
  if (Math.abs(p2[0] - p1[0]) > Math.abs(p2[1] - p1[1])) {
    dir = p2[0] > p1[0] ? DIR_X : DIR_X_NEG;
  } else {
    dir = p2[1] > p1[1] ? DIR_Y : DIR_Y_NEG;
  }

  // Bounded so a degenerate ray can never spin forever.
  const maxSteps = (map.sizeX + map.sizeY) * 2 + 8;
  for (let step = 0; step < maxSteps; step++) {
    if (
      i < 0 || i >= map.sizeX || j < 0 || j >= map.sizeY ||
      (dir === DIR_X && i > Math.floor(p2[0])) ||
      (dir === DIR_X_NEG && i < Math.floor(p2[0])) ||
      (dir === DIR_Y && j > Math.floor(p2[1])) ||
      (dir === DIR_Y_NEG && j < Math.floor(p2[1]))
    ) {
      return { hit: false, point: p2, normal: out.normal };
    }

    let percent;
    switch (dir) {
      case DIR_X:
        if (rayTileTest(map, i, j, p1, p2, out) || rayTileTest(map, i, j - 1, p1, p2, out) || rayTileTest(map, i, j + 1, p1, p2, out)) {
          return { hit: true, point: p2, normal: out.normal };
        }
        i++;
        percent = (i - p1[0]) / Math.abs(p2[0] - p1[0]);
        j = Math.floor(p1[1] + (p2[1] - p1[1]) * percent);
        break;
      case DIR_X_NEG:
        if (rayTileTest(map, i, j, p1, p2, out) || rayTileTest(map, i, j - 1, p1, p2, out) || rayTileTest(map, i, j + 1, p1, p2, out)) {
          return { hit: true, point: p2, normal: out.normal };
        }
        i--;
        percent = (p1[0] - (i + 1)) / Math.abs(p2[0] - p1[0]);
        j = Math.floor(p1[1] + (p2[1] - p1[1]) * percent);
        break;
      case DIR_Y:
        if (rayTileTest(map, i, j, p1, p2, out) || rayTileTest(map, i - 1, j, p1, p2, out) || rayTileTest(map, i + 1, j, p1, p2, out)) {
          return { hit: true, point: p2, normal: out.normal };
        }
        j++;
        percent = (j - p1[1]) / Math.abs(p2[1] - p1[1]);
        i = Math.floor(p1[0] + (p2[0] - p1[0]) * percent);
        break;
      default:
        if (rayTileTest(map, i, j, p1, p2, out) || rayTileTest(map, i - 1, j, p1, p2, out) || rayTileTest(map, i + 1, j, p1, p2, out)) {
          return { hit: true, point: p2, normal: out.normal };
        }
        j--;
        percent = (p1[1] - (j + 1)) / Math.abs(p2[1] - p1[1]);
        i = Math.floor(p1[0] + (p2[0] - p1[0]) * percent);
        break;
    }
  }

  return { hit: false, point: p2, normal: out.normal };
}

/** Segment vs sphere, used for babo hits (radius 0.25). */
export function raySphere(from, to, center, radius) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const fx = from[0] - center[0];
  const fy = from[1] - center[1];
  const fz = from[2] - center[2];
  const a = dx * dx + dy * dy + dz * dz;
  if (a === 0) return null;
  const b = 2 * (fx * dx + fy * dy + fz * dz);
  const c = fx * fx + fy * fy + fz * fz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0 || t > 1) return null;
  return { t, point: [from[0] + dx * t, from[1] + dy * t, from[2] + dz * t] };
}
