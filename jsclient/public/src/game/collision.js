// Literal port of Map::performCollision and Map::collisionClip
// (src/Game/MapRender.cpp lines 425 and 650). The axis-sequential, neighbour-triple
// structure is intentional - it defines BV2's movement feel. Do not "fix" it.
import { COLLISION_EPSILON, BOUNCE_FACTOR } from './constants.js';

/**
 * @param {import('./bvm.js').BVMap} map
 * @param {{position:number[]}} lastCF  position before the move
 * @param {{position:number[],vel:number[]}} cf  position after the move, clipped in place
 */
export function performCollision(map, lastCF, cf, radius) {
  const { sizeX, sizeY } = map;
  let x = Math.floor(cf.position[0]);
  let y = Math.floor(cf.position[1]);

  const solid = (cx, cy) => cx >= 0 && cy >= 0 && cx < sizeX && cy < sizeY
    && !map.isPassable(cx, cy);

  // --- Y axis, against the three cells on the leading side
  if (cf.vel[1] < 0) {
    for (const dx of [0, -1, 1]) {
      if (!solid(x + dx, y - 1)) continue;
      if (
        lastCF.position[0] - radius <= x + dx + 1 &&
        lastCF.position[0] + radius >= x + dx &&
        cf.position[1] - radius <= y - 1 + 1 &&
        cf.position[1] + radius >= y - 1
      ) {
        cf.position[1] = y - 1 + 1 + radius + COLLISION_EPSILON;
        cf.vel[1] = -cf.vel[1] * BOUNCE_FACTOR;
      }
    }
  } else if (cf.vel[1] > 0) {
    for (const dx of [0, -1, 1]) {
      if (!solid(x + dx, y + 1)) continue;
      if (
        lastCF.position[0] - radius <= x + dx + 1 &&
        lastCF.position[0] + radius >= x + dx &&
        cf.position[1] - radius <= y + 1 + 1 &&
        cf.position[1] + radius >= y + 1
      ) {
        cf.position[1] = y + 1 - radius - COLLISION_EPSILON;
        cf.vel[1] = -cf.vel[1] * BOUNCE_FACTOR;
      }
    }
  }

  // --- X axis, using the *pre-move* Y for the overlap test
  if (cf.vel[0] < 0) {
    for (const dy of [0, -1, 1]) {
      if (!solid(x - 1, y + dy)) continue;
      if (
        cf.position[0] - radius <= x - 1 + 1 &&
        cf.position[0] + radius >= x - 1 &&
        lastCF.position[1] - radius <= y + dy + 1 &&
        lastCF.position[1] + radius >= y + dy
      ) {
        cf.position[0] = x - 1 + 1 + radius + COLLISION_EPSILON;
        cf.vel[0] = -cf.vel[0] * BOUNCE_FACTOR;
      }
    }
  } else if (cf.vel[0] > 0) {
    for (const dy of [0, -1, 1]) {
      if (!solid(x + 1, y + dy)) continue;
      if (
        cf.position[0] - radius <= x + 1 + 1 &&
        cf.position[0] + radius >= x + 1 &&
        lastCF.position[1] - radius <= y + dy + 1 &&
        lastCF.position[1] + radius >= y + dy
      ) {
        cf.position[0] = x + 1 - radius - COLLISION_EPSILON;
        cf.vel[0] = -cf.vel[0] * BOUNCE_FACTOR;
      }
    }
  }

  lastCF.position[0] = cf.position[0];
  lastCF.position[1] = cf.position[1];
  lastCF.position[2] = cf.position[2];
}

/** Push the entity back out of any wall it ended up inside. */
export function collisionClip(map, cf, radius) {
  const { sizeX, sizeY } = map;
  const x = Math.floor(cf.position[0]);
  const y = Math.floor(cf.position[1]);
  const solid = (cx, cy) => cx >= 0 && cy >= 0 && cx < sizeX && cy < sizeY
    && !map.isPassable(cx, cy);

  // Black space outside the authored grid has no wall and no floor. Let the
  // player continue into it; vertical fall/death is handled by Player/Game.
  if (x < 0 || y < 0 || x >= sizeX || y >= sizeY) return;

  if (cf.position[0] + radius + COLLISION_EPSILON > x + 1 && solid(x + 1, y)) {
    cf.position[0] = x + 1 - radius - COLLISION_EPSILON;
  }
  if (cf.position[0] - radius - COLLISION_EPSILON < x && solid(x - 1, y)) {
    cf.position[0] = x + radius + COLLISION_EPSILON;
  }
  if (cf.position[1] + radius + COLLISION_EPSILON > y + 1 && solid(x, y + 1)) {
    cf.position[1] = y + 1 - radius - COLLISION_EPSILON;
  }
  if (cf.position[1] - radius - COLLISION_EPSILON < y && solid(x, y - 1)) {
    cf.position[1] = y + radius + COLLISION_EPSILON;
  }

  // Stuck inside a wall cell: eject towards the nearest passable neighbour.
  if (!map.isPassable(x, y)) {
    const possible = [
      map.isPassable(x - 1, y),
      map.isPassable(x + 1, y),
      map.isPassable(x, y - 1),
      map.isPassable(x, y + 1),
    ];
    const dis = [
      cf.position[0] - x,
      1 - (cf.position[0] - x),
      cf.position[1] - y,
      1 - (cf.position[1] - y),
    ];
    let best = -1;
    let currentMin = 2;
    for (let i = 0; i < 4; i++) {
      if (possible[i] && dis[i] < currentMin) {
        currentMin = dis[i];
        best = i;
      }
    }
    if (best === 0) cf.position[0] = x - radius - COLLISION_EPSILON;
    else if (best === 1) cf.position[0] = x + 1 + radius + COLLISION_EPSILON;
    else if (best === 2) cf.position[1] = y - radius - COLLISION_EPSILON;
    else if (best === 3) cf.position[1] = y + 1 + radius + COLLISION_EPSILON;
  }
}
