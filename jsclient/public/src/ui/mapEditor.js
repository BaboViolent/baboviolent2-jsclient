import { createEditorMap, parseBVM } from '../game/bvm.js';
import { THEME_NAMES } from '../game/constants.js';

export function createProfileEditorMap(width, height, name, theme, profileName) {
  return createEditorMap(width, height, { author: profileName.slice(0, 24), name, theme });
}

/** Menu2 setup only; editing itself happens in the normal game viewport. */
export class MapEditor {
  constructor(root, { author = () => '', onLaunch = () => {}, onMessage = () => {} } = {}) {
    this.root = root;
    this.author = author;
    this.onLaunch = onLaunch;
    this.onMessage = onMessage;
    this._build();
  }

  _build() {
    this.root.innerHTML = `
      <div class="editor-launch">
        <div class="menu-row"><span class="menu-label r">Map name:</span><input id="edName" maxlength="15" class="menu-edit" value="newmap"></div>
        <div class="menu-row"><span class="menu-label r">Size:</span><input id="edW" type="number" min="4" max="64" value="32" class="menu-edit tiny"> × <input id="edH" type="number" min="4" max="64" value="32" class="menu-edit tiny"></div>
        <div class="menu-row"><span class="menu-label r">Theme:</span><select id="edTheme" class="menu-edit">${THEME_NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join('')}</select></div>
        <p class="menu-hint">Author comes from your active profile. Editing opens in the full game viewport.</p>
        <div class="editor-file-row"><button id="btnEdit" class="menu-btn">Launch editor</button><label class="menu-btn file-btn">Load .bvm<input id="edLoad" type="file" accept=".bvm" hidden></label></div>
      </div>`;
    this.root.querySelector('#btnEdit').addEventListener('click', () => this.newMap());
    this.root.querySelector('#edLoad').addEventListener('change', (event) => void this.loadFile(event.target.files[0]));
  }

  newMap() {
    const width = Math.max(4, Math.min(64, Number(this.root.querySelector('#edW').value) || 32));
    const height = Math.max(4, Math.min(64, Number(this.root.querySelector('#edH').value) || 32));
    this.onLaunch(createProfileEditorMap(
      width, height,
      this.root.querySelector('#edName').value || 'newmap',
      Number(this.root.querySelector('#edTheme').value),
      this.author(),
    ));
  }

  async loadFile(file) {
    if (!file) return;
    try {
      const map = parseBVM(await file.arrayBuffer());
      map.name = file.name.replace(/\.bvm$/i, '');
      map.author = this.author().slice(0, 24);
      this.onLaunch(map);
    } catch (error) {
      this.onMessage(`Could not load map: ${error.message}`);
    }
  }
}
