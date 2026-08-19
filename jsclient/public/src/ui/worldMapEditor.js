import { serializeBVM } from '../game/bvm.js';

export const EDITOR_TOOLS = [
  ['floor', 'Floor'], ['wall', 'Wall'], ['dirt', 'Dirt'], ['dm', 'DM spawn'],
  ['blue', 'Blue spawn'], ['red', 'Red spawn'], ['blueFlag', 'Blue flag'],
  ['redFlag', 'Red flag'], ['blueObjective', 'Blue objective'],
  ['redObjective', 'Red objective'], ['eraseEntity', 'Erase entity'],
];

const sameCell = (point, x, y) => Math.floor(point[0]) === x && Math.floor(point[1]) === y;
const pointAt = (x, y) => [x + 0.5, y + 0.5, 0.25];

export function rasterCells(from, to) {
  let x = from[0], y = from[1];
  const out = [];
  const dx = Math.abs(to[0] - x), sx = x < to[0] ? 1 : -1;
  const dy = -Math.abs(to[1] - y), sy = y < to[1] ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    out.push([x, y]);
    if (x === to[0] && y === to[1]) break;
    const e2 = 2 * error;
    if (e2 >= dy) { error += dy; x += sx; }
    if (e2 <= dx) { error += dx; y += sy; }
  }
  return out;
}

export class WorldMapEditor {
  constructor({ root, canvas, game, renderer, input, onExit }) {
    Object.assign(this, { root, canvas, game, renderer, input, onExit });
    this.active = false;
    this.tool = 'floor';
    this.lastCell = null;
    this.dirtValue = 1;
    this.rebuildPending = false;
    this.playtesting = false;
    this._build();
    canvas.addEventListener('pointerdown', (event) => this.pointerDown(event));
    canvas.addEventListener('pointermove', (event) => this.pointerMove(event));
    window.addEventListener('pointerup', () => { this.lastCell = null; });
    canvas.addEventListener('contextmenu', (event) => { if (this.active) event.preventDefault(); });
  }

  _build() {
    this.root.innerHTML = `
      <strong>Map Editor</strong>
      <select id="worldEdTool" class="menu-edit">${EDITOR_TOOLS.map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select>
      <label>Height <input id="worldEdHeight" class="menu-edit tiny" type="number" min="1" max="127" value="1"></label>
      <button id="worldEdExport" class="menu-btn">Export .bvm</button>
      <button id="worldEdPlay" class="menu-btn">Playtest</button>
      <button id="worldEdExit" class="menu-btn">Exit editor</button>
      <span id="worldEdStatus"></span>
      <span class="world-editor-help">Drag to paint · WASD/Arrows pan · wheel zoom</span>`;
    this.root.querySelector('#worldEdTool').addEventListener('change', (event) => { this.tool = event.target.value; });
    this.root.querySelector('#worldEdExport').addEventListener('click', () => this.exportFile());
    this.root.querySelector('#worldEdPlay').addEventListener('click', () => this.togglePlaytest());
    this.root.querySelector('#worldEdExit').addEventListener('click', () => this.stop());
  }

  async start(map) {
    this.map = map;
    this.active = true;
    this.root.hidden = false;
    this.game.editorMode = true;
    this.game.editorMap = map;
    this.game.editorHover = null;
    this.game.ui.playing = false;
    this.game.ui.menuOpen = true;
    await this.game.setMap(map, { skipSpawn: true });
    this.renderer.cameraFocus = [map.sizeX / 2, map.sizeY / 2, 0.25];
    this.renderer.cameraHeight = Math.max(7, Math.min(24, Math.max(map.sizeX, map.sizeY) * 0.55));
    this.canvas.style.cursor = 'crosshair';
    this.status();
  }

  stop() {
    if (!this.active) return;
    if (this.playtesting) this.togglePlaytest();
    this.active = false;
    this.root.hidden = true;
    this.game.editorMode = false;
    this.game.editorMap = null;
    this.game.editorHover = null;
    this.onExit?.();
  }

  update(delay) {
    if (!this.active) return;
    if (this.playtesting) {
      this.editCamera = { focus: [...this.renderer.cameraFocus], height: this.renderer.cameraHeight };
      this.game.update(delay);
      return;
    }
    const speed = this.renderer.cameraHeight * 0.75 * delay;
    if (this.input.moveLeft) this.renderer.cameraFocus[0] -= speed;
    if (this.input.moveRight) this.renderer.cameraFocus[0] += speed;
    if (this.input.moveDown) this.renderer.cameraFocus[1] -= speed;
    if (this.input.moveUp) this.renderer.cameraFocus[1] += speed;
    const wheel = this.input.consumeWheel();
    if (wheel) this.renderer.cameraHeight = Math.max(3, Math.min(64, this.renderer.cameraHeight + wheel * 1.5));
    this.renderer.cameraFocus[0] = Math.max(0, Math.min(this.map.sizeX, this.renderer.cameraFocus[0]));
    this.renderer.cameraFocus[1] = Math.max(0, Math.min(this.map.sizeY, this.renderer.cameraFocus[1]));
  }

  worldCell(event) {
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((event.clientY - rect.top) / rect.height) * 2;
    const halfHeight = Math.tan(Math.PI / 6) * this.renderer.cameraHeight;
    return [
      Math.floor(this.renderer.cameraFocus[0] + ndcX * halfHeight * (rect.width / rect.height)),
      Math.floor(this.renderer.cameraFocus[1] + ndcY * halfHeight),
    ];
  }

  pointerDown(event) {
    if (!this.active || this.playtesting || (event.button !== 0 && event.button !== 2)) return;
    event.preventDefault();
    const cell = this.worldCell(event);
    this.lastCell = { cell, erase: event.button === 2 };
    if (event.button === 0 && this.tool === 'dirt' && this.inBounds(cell)) {
      const i = cell[1] * (this.map.sizeX + 1) + cell[0];
      this.dirtValue = this.map.dirt[i] > 0.5 ? 0 : 1;
    }
    this.paintCells([cell], event.button === 2);
  }

  pointerMove(event) {
    if (!this.active || this.playtesting) return;
    const cell = this.worldCell(event);
    this.game.editorHover = this.inBounds(cell) ? cell : null;
    const painting = event.buttons & 1;
    const erasing = event.buttons & 2;
    if ((painting || erasing) && this.lastCell) this.paintCells(rasterCells(this.lastCell.cell, cell), erasing);
    this.lastCell = (painting || erasing) ? { cell, erase: erasing } : null;
  }

  inBounds([x, y]) { return x >= 0 && y >= 0 && x < this.map.sizeX && y < this.map.sizeY; }

  paintCells(cells, erase = false) {
    let changed = false;
    for (const [x, y] of cells) if (this.inBounds([x, y])) changed = (erase ? this.eraseAt(x, y) : this.applyTool(x, y)) || changed;
    if (changed) this.scheduleRebuild();
  }

  eraseAt(x, y) {
    const index = y * this.map.sizeX + x;
    this.map.cells[index] = 0x80;
    this.map.dirt[y * (this.map.sizeX + 1) + x] = 0;
    for (const key of ['dmSpawns', 'blueSpawns', 'redSpawns']) this.map[key] = this.map[key].filter((v) => !sameCell(v, x, y));
    for (const key of ['flagPod', 'objective']) for (let i = 0; i < 2; i++) if (sameCell(this.map[key][i], x, y)) this.map[key][i] = [0, 0, 0];
    return true;
  }

  togglePlaytest() {
    this.playtesting = !this.playtesting;
    const button = this.root.querySelector('#worldEdPlay');
    button.textContent = this.playtesting ? 'Return to editor' : 'Playtest';
    this.root.querySelectorAll('select,input,#worldEdExport').forEach((el) => { el.disabled = this.playtesting; });
    if (this.playtesting) {
      this.game.editorMode = false;
      this.game.ui.playing = true;
      this.game.ui.menuOpen = false;
      this.game.onlineMode = false;
      this.game.spawnPlayer(this.game.thisPlayer);
      this.root.classList.add('playtesting');
      this.canvas.style.cursor = 'crosshair';
    } else {
      this.game.editorMode = true;
      this.game.ui.playing = false;
      this.game.ui.menuOpen = true;
      this.renderer.rebuildMap(this.map);
      this.game.projectiles.length = 0;
      this.game.tracers.length = 0;
      this.game.brass.length = 0;
      if (this.editCamera) {
        this.renderer.cameraFocus = [...this.editCamera.focus];
        this.renderer.cameraHeight = this.editCamera.height;
      }
      this.root.classList.remove('playtesting');
      this.canvas.style.cursor = 'crosshair';
    }
  }

  applyTool(x, y) {
    const index = y * this.map.sizeX + x;
    if (this.tool === 'floor') this.map.cells[index] = 0x80;
    else if (this.tool === 'wall') this.map.cells[index] = Math.max(1, Math.min(127, Number(this.root.querySelector('#worldEdHeight').value) || 1));
    else if (this.tool === 'dirt') this.map.dirt[y * (this.map.sizeX + 1) + x] = this.dirtValue;
    else this.placeEntity(x, y);
    return true;
  }

  placeEntity(x, y) {
    const p = pointAt(x, y);
    const addUnique = (list) => { if (!list.some((v) => sameCell(v, x, y))) list.push(p); };
    if (this.tool === 'dm') addUnique(this.map.dmSpawns);
    else if (this.tool === 'blue') addUnique(this.map.blueSpawns);
    else if (this.tool === 'red') addUnique(this.map.redSpawns);
    else if (this.tool === 'blueFlag') this.map.flagPod[0] = p;
    else if (this.tool === 'redFlag') this.map.flagPod[1] = p;
    else if (this.tool === 'blueObjective') this.map.objective[0] = p;
    else if (this.tool === 'redObjective') this.map.objective[1] = p;
    else if (this.tool === 'eraseEntity') {
      for (const key of ['dmSpawns', 'blueSpawns', 'redSpawns']) this.map[key] = this.map[key].filter((v) => !sameCell(v, x, y));
      for (const key of ['flagPod', 'objective']) for (let i = 0; i < 2; i++) if (sameCell(this.map[key][i], x, y)) this.map[key][i] = [0, 0, 0];
    }
  }

  scheduleRebuild() {
    if (this.rebuildPending) return;
    this.rebuildPending = true;
    requestAnimationFrame(() => {
      this.rebuildPending = false;
      this.renderer.rebuildMap(this.map);
      this.status();
    });
  }

  status() { this.root.querySelector('#worldEdStatus').textContent = `${this.map.name} · ${this.map.sizeX}×${this.map.sizeY}`; }

  exportFile() {
    const blob = new Blob([serializeBVM(this.map)], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${this.map.name || 'newmap'}.bvm`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
