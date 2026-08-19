// Keyboard/mouse state. Key bindings mirror the defaults in src/Source/GameVar.cpp.
export class Input {
  constructor(canvas, bindings = {}) {
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, buttons: 0 };
    this.canvas = canvas;
    /** Edge-triggered mouse buttons (DKI_DOWN), consumed once per frame. */
    this.mousePressed = new Set();
    this.wheelDelta = 0;
    this.tabDown = false;
    this.bindings = bindings;

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    canvas.addEventListener('wheel', (e) => {
      this.wheelDelta += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('blur', () => {
      // Only clear input when leaving the window entirely, not when switching tabs.
      if (document.hidden) return;
      this.keys.clear();
      this.mouse.buttons = 0;
      this.mousePressed.clear();
    });

    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2) e.preventDefault();
      if ((this.mouse.buttons & (1 << e.button)) === 0) this.mousePressed.add(e.button);
      this.mouse.buttons |= 1 << e.button;
    });
    window.addEventListener('mouseup', (e) => {
      this.mouse.buttons &= ~(1 << e.button);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // Middle-click autoscroll would steal MMB; keep focus on the canvas.
    canvas.addEventListener('auxclick', (e) => e.preventDefault());
  }

  onFirstGesture(fn) {
    const once = () => {
      fn();
      window.removeEventListener('pointerdown', once);
      window.removeEventListener('keydown', once);
    };
    window.addEventListener('pointerdown', once);
    window.addEventListener('keydown', once);
  }

  setBindings(bindings) { this.bindings = bindings; }
  bound(action, fallback) { return this.bindings[action] ?? fallback; }

  get moveUp() { return this.keys.has(this.bound('moveUp', 'KeyW')) || this.keys.has('ArrowUp'); }
  get moveDown() { return this.keys.has(this.bound('moveDown', 'KeyS')) || this.keys.has('ArrowDown'); }
  get moveLeft() { return this.keys.has(this.bound('moveLeft', 'KeyA')) || this.keys.has('ArrowLeft'); }
  get moveRight() { return this.keys.has(this.bound('moveRight', 'KeyD')) || this.keys.has('ArrowRight'); }

  /** k_shoot — Mouse1, hold to fire primary weapon. */
  get shoot() { return (this.mouse.buttons & 1) !== 0; }

  consumeShootPress() {
    if (!this.mousePressed.has(0)) return false;
    this.mousePressed.delete(0);
    return true;
  }

  /** k_melee — Space, hold to use secondary (knives/shield). */
  get melee() { return this.keys.has(this.bound('melee', 'Space')); }

  /** k_throwGrenade — Mouse2, edge trigger (PlayerUpdate.cpp:607). */
  consumeThrowGrenade() {
    if (!this.mousePressed.has(2)) return false;
    this.mousePressed.delete(2);
    return true;
  }

  /** k_throwMolotov — Mouse3, edge trigger (PlayerUpdate.cpp:624). */
  consumeThrowMolotov() {
    if (!this.mousePressed.has(1)) return false;
    this.mousePressed.delete(1);
    return true;
  }

  /** k_pickUp — F, edge trigger (PlayerUpdate.cpp:647). */
  consumePickup() {
    const code = this.bound('pickup', 'KeyF');
    if (!this.keys.has(code)) return false;
    this.keys.delete(code);
    return true;
  }

  consumePress(code) {
    if (!this.keys.has(code)) return false;
    this.keys.delete(code);
    return true;
  }

  consumeWheel() {
    const d = this.wheelDelta;
    this.wheelDelta = 0;
    return d;
  }

  get tabHeld() {
    return this.keys.has('Tab');
  }
}
