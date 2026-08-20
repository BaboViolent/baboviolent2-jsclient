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

export class MobileSpectatorControls {
  constructor(root, input, { onChat } = {}) {
    this.root = root;
    this.input = input;
    root.querySelectorAll('[data-mobile-move]').forEach((button) => {
      const direction = button.dataset.mobileMove;
      const finish = (event) => {
        input.setTouchMove(direction, false);
        button.classList.remove('active');
        if (event.pointerId != null && button.hasPointerCapture?.(event.pointerId)) {
          button.releasePointerCapture(event.pointerId);
        }
      };
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        button.setPointerCapture?.(event.pointerId);
        input.setTouchMove(direction, true);
        button.classList.add('active');
      });
      button.addEventListener('pointerup', finish);
      button.addEventListener('pointercancel', finish);
      button.addEventListener('lostpointercapture', finish);
    });
    root.querySelectorAll('[data-mobile-zoom]').forEach((button) => {
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        input.addTouchZoom(Number(button.dataset.mobileZoom));
      });
    });
    root.querySelector('#mobileChat')?.addEventListener('click', () => onChat?.());
  }

  setVisible(visible) { this.root.hidden = !visible; }
}
