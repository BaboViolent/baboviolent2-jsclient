// UV sphere matching the engine's drawSphere(radius, slices, stacks) used for
// babos. Z-up, texture wrapped like gluSphere so the skin TGA maps correctly.
// Vertex layout matches the renderer: x,y,z, u,v, shade, alpha.

export function buildSphere(radius, slices, stacks) {
  const data = [];
  const at = (i, j) => {
    const u = i / slices;
    const v = j / stacks;
    const theta = u * Math.PI * 2;
    const phi = v * Math.PI;
    const sp = Math.sin(phi);
    return [
      radius * sp * Math.cos(theta),
      radius * sp * Math.sin(theta),
      radius * Math.cos(phi),
      u,
      v,
      1,
      1,
    ];
  };

  for (let j = 0; j < stacks; j++) {
    for (let i = 0; i < slices; i++) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i + 1, j + 1);
      const d = at(i, j + 1);
      data.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
  }
  return new Float32Array(data);
}
