// 3x3 rotation helpers matching CMatrix::RotateArbitrary / normalize,
// used for the rolling babo sphere (src/Game/PlayerUpdate.cpp:348).
// Column-major: m[0..2] = column 0.

export function identity3() {
  return new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
}

function multiply3(a, b) {
  const out = new Float32Array(9);
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 3; r++) {
      out[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2];
    }
  }
  return out;
}

/** Rotate `m` by `angle` radians about the unit axis `axis`. */
export function rotateArbitrary(m, angleRad, axis) {
  const [x, y, z] = axis;
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const t = 1 - c;
  const rot = new Float32Array([
    t * x * x + c, t * x * y + s * z, t * x * z - s * y,
    t * x * y - s * z, t * y * y + c, t * y * z + s * x,
    t * x * z + s * y, t * y * z - s * x, t * z * z + c,
  ]);
  return multiply3(rot, m);
}

/** Gram-Schmidt re-orthonormalisation; the C++ does this because the ball shrinks. */
export function orthonormalize(m) {
  const col = (i) => [m[i * 3], m[i * 3 + 1], m[i * 3 + 2]];
  const norm = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const x = norm(col(0));
  let z = norm(cross(x, col(1)));
  const y = cross(z, x);
  const out = new Float32Array(9);
  out.set(x, 0);
  out.set(y, 3);
  out.set(z, 6);
  return out;
}

/** Expand a 3x3 rotation plus a translation into a column-major mat4. */
export function toMat4(m3, translation) {
  return new Float32Array([
    m3[0], m3[1], m3[2], 0,
    m3[3], m3[4], m3[5], 0,
    m3[6], m3[7], m3[8], 0,
    translation[0], translation[1], translation[2], 1,
  ]);
}
