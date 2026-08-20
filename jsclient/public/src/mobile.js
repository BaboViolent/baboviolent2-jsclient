export function isMobileSpectatorDevice({ maxTouchPoints = 0, coarsePointer = false, width = Infinity } = {}) {
  return maxTouchPoints > 0 && (coarsePointer || width <= 900);
}

export function browserIsMobileSpectator(win = window) {
  return isMobileSpectatorDevice({
    maxTouchPoints: win.navigator?.maxTouchPoints ?? 0,
    coarsePointer: win.matchMedia?.('(pointer: coarse)').matches ?? false,
    width: win.innerWidth,
  });
}

export function touchGestureDelta(previous, current) {
  if (previous.length !== current.length || current.length === 0) return { panX: 0, panY: 0, zoom: 0 };
  const center = (points) => points.reduce((sum, point) => ({
    x: sum.x + point.x / points.length,
    y: sum.y + point.y / points.length,
  }), { x: 0, y: 0 });
  const before = center(previous);
  const after = center(current);
  let zoom = 0;
  if (current.length >= 2) {
    const oldDistance = Math.hypot(previous[1].x - previous[0].x, previous[1].y - previous[0].y);
    const newDistance = Math.hypot(current[1].x - current[0].x, current[1].y - current[0].y);
    // A phone-sized pinch has much less physical travel than repeated desktop
    // wheel input, so amplify it enough to traverse the full camera range.
    zoom = (oldDistance - newDistance) / 10;
  }
  return { panX: after.x - before.x, panY: after.y - before.y, zoom };
}

export class MobileSpectatorControls {
  constructor(root, input, { onChat, onScoreboard } = {}) {
    this.root = root;
    this.input = input;
    this.visible = false;
    this.pointers = new Map();
    this.scoreboardVisible = false;
    const canvas = input.canvas;
    canvas.addEventListener('pointerdown', (event) => {
      if (!this.visible || event.pointerType === 'mouse') return;
      event.preventDefault();
      canvas.setPointerCapture?.(event.pointerId);
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!this.visible || !this.pointers.has(event.pointerId)) return;
      event.preventDefault();
      const previous = [...this.pointers.values()];
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const current = [...this.pointers.values()];
      const gesture = touchGestureDelta(previous, current);
      if (current.length === 1) input.addTouchPan(gesture.panX, gesture.panY);
      if (current.length >= 2 && gesture.zoom !== 0) input.addTouchZoom(gesture.zoom);
    });
    const finish = (event) => this.pointers.delete(event.pointerId);
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', finish);
    canvas.addEventListener('lostpointercapture', finish);
    root.querySelector('#mobileChat')?.addEventListener('click', () => onChat?.());
    const scoreboard = root.querySelector('#mobileScoreboard');
    scoreboard?.addEventListener('click', () => {
      this.scoreboardVisible = !this.scoreboardVisible;
      scoreboard.classList.toggle('active', this.scoreboardVisible);
      scoreboard.setAttribute('aria-pressed', String(this.scoreboardVisible));
      onScoreboard?.(this.scoreboardVisible);
    });
    this.onScoreboard = onScoreboard;
  }

  setVisible(visible) {
    this.visible = visible;
    this.root.hidden = !visible;
    if (!visible) this.pointers.clear();
    if (!visible && this.scoreboardVisible) {
      this.scoreboardVisible = false;
      const scoreboard = this.root.querySelector('#mobileScoreboard');
      scoreboard?.classList.remove('active');
      scoreboard?.setAttribute('aria-pressed', 'false');
      this.onScoreboard?.(false);
    }
  }
}
