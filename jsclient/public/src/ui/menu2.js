// Menu2 shell — CMainTab.cpp / MenuSetup.cpp (800×600 overlay).
import { loadMenuBackgrounds, applyPanelBackground } from './menuAssets.js';
import { ProfilePreview } from './profilePreview.js';
import { attachBv2TextInput } from './colorInput.js';
import { MapEditor } from './mapEditor.js';
import { createMenuPanelMotion, stepMenuPanelMotion } from './menuPanelMotion.js';
import { formatHostPort } from '../net/joinTarget.js';

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'browser', label: 'Game Browser' },
  { id: 'editor', label: 'Map Editor' },
  { id: 'options', label: 'Options' },
  { id: 'credits', label: 'Credits' },
];

export const NATIVE_CREDITS = [
  { role: 'Game Designer', names: ['David St-Louis "\x03RndLabs"'] },
  { role: 'Programmers', names: [
    'David St-Louis "\x03RndLabs"',
    'Marc Durocher "\x03RndLabs"',
    'Jason "nuvem" Kozak',
    'Dominik "cnik" Kornaus',
    'Paulius "PM" Maruska',
    'Louis "Lordlou" Poirier',
  ] },
  { role: 'Modeling / Graphics', names: [
    'Adam Pilkington "\x03HeadGames Art Lead"',
    'David St-Louis "\x03RndLabs"',
    'Louis-Nicolas Dozois "\x03HeadGames"',
    'Michal "Pacifist" Mojzik',
  ] },
  { role: 'Sound designers', names: ['Dominic "Doimuk" Valiquette'] },
  { role: 'Music samples', names: ['Lamb of God'] },
  { role: 'Quality Control', names: [
    'Sunita Kollipara "\x03HeadGames"',
    'Whole www.baboviolent.net community - Thanks guys!',
  ] },
];

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
export const NATIVE_INTRO_DURATION_MS = 3000;
export const SERVER_REFRESH_INTERVAL_MS = 15000;

export class Menu2 {
  /**
   * @param {object} opts
   * @param {import('./settings.js').ClientSettings} opts.settings
   * @param {import('../game/game.js').Game} opts.game
   * @param {import('../assets/assetCache.js').AssetCache} opts.assets
   */
  constructor({ settings, game, assets }) {
    this.settings = settings;
    this.game = game;
    this.assets = assets;
    this.root = document.getElementById('menu2');
    this.intro = document.getElementById('intro');
    this.loading = document.getElementById('loading');
    this.tabBar = document.getElementById('menu2Tabs');
    this.panels = {};
    this.onResume = null;
    this.onCancelJoin = null;
    this.onProfileNameChange = null;
    this.onProfileSkinChange = null;
    this.sessionActive = false;
    this.mapNames = [];
    this.bgUrls = null;
    this.panelFrame = document.getElementById('menuPanelFrame');
    this.connectOverlay = document.getElementById('connectOverlay');
    this.connectStatus = document.getElementById('connectStatus');
    this._activeTab = 'profile';
    this._panelMotion = null;
    this._animatedPanel = null;
    this.profilePreview = null;
    this.mobileSpectator = Boolean(game.mobileSpectator);
    this._serverRefreshInFlight = false;
    this._buildDOM();
    this._wireTabs();
    this._serverRefreshTimer = setInterval(() => {
      if (!this.root.hidden && this._activeTab === 'browser') void this.refreshServers({ showLoading: false });
    }, SERVER_REFRESH_INTERVAL_MS);
  }

  async loadAssets() {
    const { urls } = await loadMenuBackgrounds(this.assets);
    this.bgUrls = urls;
    applyPanelBackground(this.panelFrame, urls, this._activeTab);
    const canvas = document.getElementById('profPreview');
    if (canvas && !this.profilePreview) {
      this.profilePreview = new ProfilePreview(canvas, this.assets);
      await this.profilePreview.load();
      await this.updateProfilePreview();
    }
  }

  _buildDOM() {
    for (const tab of TABS) {
      this.panels[tab.id] = document.getElementById(`panel-${tab.id}`);
    }
    this._buildProfilePanel();
    this._buildBrowserPanel();
    if (this.mobileSpectator) {
      this.tabBar.querySelector('[data-tab="editor"]')?.remove();
    } else {
      this._buildEditorPanel();
    }
    this._buildOptionsPanel();
    this._buildCreditsPanel();

    document.getElementById('btnResume').addEventListener('click', () => {
      if (this.onResume) this.onResume();
    });
    this.setSessionActive(false);
    document.getElementById('btnCancelConnect').addEventListener('click', () => this.onCancelJoin?.());
  }

  _wireTabs() {
    this.tabBar.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('pointerenter', () => {
        if (!btn.disabled) void this.game.audio?.play2D('ControlOver.wav', 200);
      });
      btn.addEventListener('click', () => {
        void this.game.audio?.play2D('Button.wav', 200);
        this.showTab(btn.dataset.tab, { animate: true });
      });
    });
  }

  showTab(id, { animate = false } = {}) {
    this._activeTab = id;
    this.tabBar.querySelectorAll('.menu-tab[data-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === id);
      btn.toggleAttribute('disabled', btn.dataset.tab === id);
    });
    for (const tab of TABS) {
      if (this.panels[tab.id]) this.panels[tab.id].hidden = tab.id !== id;
    }
    if (animate && this.panels[id]) this._startPanelAnimation(this.panels[id]);
    if (this.bgUrls) applyPanelBackground(this.panelFrame, this.bgUrls, id);
    if (id === 'browser') void this.refreshServers();
    if (id === 'profile') void this.updateProfilePreview();
  }

  tickPreview(delay) {
    if (this.root.hidden) return;
    this._tickPanelAnimation(delay);
    if (this._activeTab !== 'profile' || !this.profilePreview) return;
    this.profilePreview.tick(delay, this.game.input);
    this.profilePreview.render();
  }

  _startPanelAnimation(panel) {
    if (this._animatedPanel && this._animatedPanel !== panel) {
      this._animatedPanel.style.transform = '';
    }
    this._animatedPanel = panel;
    this._panelMotion = createMenuPanelMotion();
    this._applyPanelAnimation();
  }

  _applyPanelAnimation() {
    if (!this._animatedPanel || !this._panelMotion) return;
    const scale = Math.max(1, this.root.clientHeight) / 600;
    this._animatedPanel.style.transform = `translateY(${this._panelMotion.y * scale}px)`;
  }

  _tickPanelAnimation(delay) {
    if (!this._panelMotion?.active) return;
    const impacts = stepMenuPanelMotion(this._panelMotion, delay);
    this._applyPanelAnimation();
    if (impacts > 0) void this.game.audio?.play2D('impact.wav', 150);
    if (!this._panelMotion.active && this._animatedPanel) {
      this._animatedPanel.style.transform = '';
    }
  }

  async runIntro() {
    const canvas = document.getElementById('introLogo');
    const image = await this.assets.loadImage('main/textures/RnDLabs.tga');
    canvas.width = image.width;
    canvas.height = image.height;
    const pixels = new Uint8ClampedArray(
      image.pixels.buffer,
      image.pixels.byteOffset,
      image.pixels.byteLength,
    );
    canvas.getContext('2d').putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
    // Restart the native 1s fade-in, 1s hold, 1s fade-out if boot is rerun.
    canvas.style.animation = 'none';
    void canvas.offsetWidth;
    canvas.style.animation = '';
    this.loading.hidden = true;
    this.intro.hidden = false;
    this.intro.tabIndex = 0;
    this.intro.focus({ preventScroll: true });

    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.intro.hidden = true;
        this.loading.hidden = true;
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('keyup', onKey, true);
        window.removeEventListener('pointerdown', finish, true);
        this.intro.removeEventListener('click', finish);
        clearTimeout(timer);
        resolve();
      };
      const onKey = (e) => {
        if (e.repeat) return;
        e.preventDefault();
        finish();
      };
      const timer = setTimeout(finish, NATIVE_INTRO_DURATION_MS);
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('keyup', onKey, true);
      window.addEventListener('pointerdown', finish, true);
      this.intro.addEventListener('click', finish);
    });
  }

  show() {
    this.root.hidden = false;
    this.game.ui.menuOpen = true;
    this.showTab(this._activeTab);
    requestAnimationFrame(() => this.profilePreview?.render());
    const mv = this.settings.data.musicVolume ?? 60;
    void this.game.audio?.playMusic('Music.ogg', mv);
  }

  hide() {
    this.root.hidden = true;
    this.game.ui.menuOpen = false;
    if (this.sessionActive) {
      this.game.ui.playing = true;
    }
  }

  setSessionActive(v) {
    this.sessionActive = v;
    document.getElementById('btnResume').hidden = !v;
  }

  setConnecting(message, { error = false, visible = true } = {}) {
    this.connectOverlay.hidden = !visible;
    this.connectStatus.textContent = message;
    this.connectStatus.classList.toggle('error', error);
  }

  _buildProfilePanel() {
    const p = this.panels.profile;
    p.innerHTML = `
      <div class="panel-inner panel-profile">
        <div class="menu-sep">Profile</div>
        <div class="menu-row profile-name-row">
          <span class="menu-label profile-name-label">Player name:</span>
          <input type="text" id="profName" maxlength="31" class="menu-edit menu-edit-wide">
        </div>
        <div class="menu-sep">Appearance</div>
        <div class="profile-body">
          <div class="prof-preview-wrap">
            <canvas id="profPreview" width="256" height="256" class="prof-preview"></canvas>
            <div class="prof-preview-help">Use movement keys to rotate</div>
          </div>
          <div class="prof-sliders">
            <div class="menu-row compact"><span class="menu-label">Skin:</span>
              <input type="range" id="profSkin" class="menu-slider" min="1" max="23" value="10"></div>
            <div class="menu-label block">Layer 1 (red/green/blue):</div>
            <input type="range" id="profL1r" class="menu-slider" min="0" max="255">
            <input type="range" id="profL1g" class="menu-slider" min="0" max="255">
            <input type="range" id="profL1b" class="menu-slider" min="0" max="255">
            <div class="menu-label block">Layer 2 (red/green/blue):</div>
            <input type="range" id="profL2r" class="menu-slider" min="0" max="255">
            <input type="range" id="profL2g" class="menu-slider" min="0" max="255">
            <input type="range" id="profL2b" class="menu-slider" min="0" max="255">
            <div class="menu-label block">Layer 3 (red/green/blue):</div>
            <input type="range" id="profL3r" class="menu-slider" min="0" max="255">
            <input type="range" id="profL3g" class="menu-slider" min="0" max="255">
            <input type="range" id="profL3b" class="menu-slider" min="0" max="255">
          </div>
        </div>
      </div>`;

    const s = this.settings.data;
    const setDecalSliders = () => {
      const d = s.decals;
      document.getElementById('profL1r').value = Math.round(d.red[0] * 255);
      document.getElementById('profL1g').value = Math.round(d.red[1] * 255);
      document.getElementById('profL1b').value = Math.round(d.red[2] * 255);
      document.getElementById('profL2r').value = Math.round(d.green[0] * 255);
      document.getElementById('profL2g').value = Math.round(d.green[1] * 255);
      document.getElementById('profL2b').value = Math.round(d.green[2] * 255);
      document.getElementById('profL3r').value = Math.round(d.blue[0] * 255);
      document.getElementById('profL3g').value = Math.round(d.blue[1] * 255);
      document.getElementById('profL3b').value = Math.round(d.blue[2] * 255);
    };

    document.getElementById('profSkin').value = s.skinIndex;
    setDecalSliders();

    const sync = () => {
      s.skinIndex = Number(document.getElementById('profSkin').value);
      s.decals.red = [
        document.getElementById('profL1r').value / 255,
        document.getElementById('profL1g').value / 255,
        document.getElementById('profL1b').value / 255,
      ];
      s.decals.green = [
        document.getElementById('profL2r').value / 255,
        document.getElementById('profL2g').value / 255,
        document.getElementById('profL2b').value / 255,
      ];
      s.decals.blue = [
        document.getElementById('profL3r').value / 255,
        document.getElementById('profL3g').value / 255,
        document.getElementById('profL3b').value / 255,
      ];
      this.settings.save();
      this.settings.applyToPlayer(this.game.thisPlayer);
      void this.updateProfilePreview();
      void this.reloadPlayerSkin();
      this.onProfileSkinChange?.(this.settings.skinName, s.decals);
    };

    void attachBv2TextInput(document.getElementById('profName'), {
      maxLength: 31,
      assets: this.assets,
      getValue: () => s.playerName,
      setValue: (v) => { s.playerName = v; },
      onChange: () => {
        this.settings.save();
        this.settings.applyToPlayer(this.game.thisPlayer);
        this.onProfileNameChange?.(s.playerName);
      },
    });

    p.querySelectorAll('input[type="range"]').forEach((el) => el.addEventListener('input', sync));
  }

  async updateProfilePreview() {
    if (!this.profilePreview) return;
    const s = this.settings.data;
    await this.profilePreview.updateSkin(this.settings.skinName, s.decals);
    this.profilePreview.render();
  }

  async reloadPlayerSkin() {
    const p = this.game.thisPlayer;
    if (!p || !this.game.renderer) return;
    p.skinTexture = await this.game.renderer.loadSkin(p.skin, p.decals);
  }

  _buildBrowserPanel() {
    this.panels.browser.innerHTML = `
      <div class="panel-inner panel-browser">
        <div class="browser-top">
          <span class="menu-label">IP address :</span>
          <input type="text" id="joinIP" class="menu-edit">
          <span class="menu-label">Password :</span>
          <input type="password" id="joinPass" class="menu-edit menu-edit-sm">
          <button type="button" class="menu-btn" id="btnJoin">Join</button>
          <button type="button" class="menu-btn" id="btnRefresh">Refresh</button>
        </div>
        <ul id="serverList" class="menu-listbox"></ul>
      </div>`;

    const s = this.settings.data;
    document.getElementById('joinIP').value = s.lastIP + (s.lastPort ? `:${s.lastPort}` : '');
    document.getElementById('joinPass').value = s.joinPassword;
    document.getElementById('btnRefresh').addEventListener('click', () => this.refreshServers());
    document.getElementById('btnJoin').addEventListener('click', () => {
      const raw = document.getElementById('joinIP').value.trim();
      s.lastIP = raw || '127.0.0.1';
      // The raw target may already contain a port, IPv6 brackets, scheme, or path.
      s.lastPort = 0;
      s.joinPassword = document.getElementById('joinPass').value;
      this.settings.save();
      if (this.onJoin) {
        void this.onJoin(s.lastIP, null, s.joinPassword);
      }
    });
  }

  async refreshServers({ showLoading = true } = {}) {
    const list = document.getElementById('serverList');
    if (!list || this._serverRefreshInFlight) return;
    this._serverRefreshInFlight = true;
    if (showLoading || !list.children.length) list.innerHTML = '<li>Loading…</li>';
    try {
      const servers = await (await fetch('/api/servers')).json();
      servers.sort((a, b) => Number(b.players) - Number(a.players)
        || Number(a.ping) - Number(b.ping)
        || String(a.name).localeCompare(String(b.name)));
      if (!servers.length) {
        list.innerHTML = '<li>No servers listed</li>';
        return;
      }
      list.innerHTML = servers.map((sv) =>
        `<li data-ip="${escapeHtml(sv.ip)}" data-port="${Number(sv.port)}" data-name="${escapeHtml(sv.name)}"><strong>${escapeHtml(sv.name)}</strong> — ${escapeHtml(sv.map)} (${Number(sv.players)}/${Number(sv.maxPlayers)}) ping ${Number(sv.ping)}ms</li>`,
      ).join('');
      list.querySelectorAll('li[data-ip]').forEach((li) => {
        li.addEventListener('click', () => {
          const s = this.settings.data;
          document.getElementById('joinIP').value = formatHostPort(li.dataset.ip, li.dataset.port);
          s.lastIP = li.dataset.ip;
          s.lastPort = Number(li.dataset.port);
          this.settings.save();
        });
        li.addEventListener('dblclick', () => {
          if (this.onJoin) {
            const s = this.settings.data;
            void this.onJoin(li.dataset.ip, Number(li.dataset.port), s.joinPassword ?? '', li.dataset.name ?? '');
          }
        });
      });
    } catch (err) {
      list.innerHTML = `<li>Error: ${err.message}</li>`;
    } finally {
      this._serverRefreshInFlight = false;
    }
  }

  setMapNames(names) {
    this.mapNames = names;
    if (!this.settings.data.exploreMap && names[0]) {
      this.settings.data.exploreMap = names[0];
    }
  }

  _buildEditorPanel() {
    this.panels.editor.innerHTML = '<div class="panel-inner panel-editor" id="mapEditor"></div>';
    this.mapEditor = new MapEditor(document.getElementById('mapEditor'), {
      author: () => this.settings.data.playerName,
      onLaunch: (map) => this.onEditMap?.(map),
      onMessage: (message) => this.game.ui.log(`\x07${message}`),
    });
  }

  _buildOptionsPanel() {
    this.panels.options.innerHTML = `
      <div class="panel-inner panel-options">
        <div class="menu-sep">Sound</div>
        <div class="menu-row"><span class="menu-label r">Master volume:</span>
          <input type="range" id="optMaster" class="menu-slider" min="0" max="255"></div>
        <div class="menu-row"><span class="menu-label r">Music volume:</span>
          <input type="range" id="optMusic" class="menu-slider" min="0" max="255"></div>
        ${this.mobileSpectator ? '' : '<div class="menu-sep">Controls</div><div id="optBindings"></div>'}
      </div>`;

    const s = this.settings.data;
    document.getElementById('optMaster').value = s.masterVolume;
    document.getElementById('optMusic').value = s.musicVolume;

    const bindLabels = {
      moveUp: 'Move up', moveDown: 'Move down', moveLeft: 'Move left',
      moveRight: 'Move right', melee: 'Melee', pickup: 'Pick up',
    };
    const bindings = document.getElementById('optBindings');
    if (bindings) bindings.innerHTML = Object.entries(bindLabels).map(([action, label]) =>
      `<div class="menu-row"><span class="menu-label r">${label}:</span>` +
      `<button type="button" class="menu-btn key-bind" data-bind="${action}">${s.bindings[action]}</button></div>`,
    ).join('');
    bindings?.querySelectorAll('[data-bind]').forEach((button) => {
      button.addEventListener('click', () => {
        button.textContent = 'Press a key…';
        const capture = (event) => {
          event.preventDefault();
          s.bindings[button.dataset.bind] = event.code;
          button.textContent = event.code;
          this.game.input.setBindings(s.bindings);
          this.settings.save();
        };
        window.addEventListener('keydown', capture, { once: true, capture: true });
      });
    });

    const sync = () => {
      s.masterVolume = Number(document.getElementById('optMaster').value);
      s.musicVolume = Number(document.getElementById('optMusic').value);
      this.settings.save();
      if (this.game.audio?.setMasterVolume) {
        this.game.audio.setMasterVolume(s.masterVolume / 255);
      }
      void this.game.audio?.playMusic('Music.ogg', s.musicVolume);
    };
    this.panels.options.querySelectorAll('input').forEach((el) => {
      el.addEventListener('input', sync);
    });
  }

  _buildCreditsPanel() {
    const formatName = (name) => {
      const [base, accent] = name.split('\x03');
      return escapeHtml(base) + (accent === undefined ? '' : `<span class="cred-code3">${escapeHtml(accent)}</span>`);
    };
    const html = NATIVE_CREDITS.map((group) => `
      <section class="cred-group">
        <p class="cred-role">${escapeHtml(group.role)}</p>
        ${group.names.map((name) => `<p class="cred-name">${formatName(name)}</p>`).join('')}
      </section>`).join('');
    this.panels.credits.innerHTML = `
      <div class="panel-inner panel-credits">
        <div class="cred-title">BaboViolent 2 | Team</div>
        ${html}
      </div>`;
  }

  _delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
}
