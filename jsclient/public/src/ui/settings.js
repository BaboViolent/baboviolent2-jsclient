// Client settings — mirrors gameVar cl_* / sv_* defaults (GameVar.cpp).
import { DEFAULT_DECALS } from '../game/skin.js';

const STORAGE_KEY = 'bv2-client-settings';

export const DEFAULT_SETTINGS = {
  playerName: 'Unnamed Babo',
  skinIndex: 10,
  decals: {
    red: [...DEFAULT_DECALS.red],
    green: [...DEFAULT_DECALS.green],
    blue: [...DEFAULT_DECALS.blue],
  },
  primaryWeapon: 0,
  meleeWeapon: 10,
  masterVolume: 255,
  musicVolume: 60,
  renderScale: 1,
  bindings: {
    moveUp: 'KeyW',
    moveDown: 'KeyS',
    moveLeft: 'KeyA',
    moveRight: 'KeyD',
    melee: 'Space',
    pickup: 'KeyF',
  },
  exploreMap: '',
  exploreGameType: 0,
  lastIP: '127.0.0.1',
  lastPort: 8080,
  joinPassword: '',
  host: {
    name: 'BV2 Web Server', password: '', map: 'CTF-BurialMound',
    gameType: 2, bind: '0.0.0.0:8080', maxPlayers: 16, bots: 2, winLimit: 7,
    timeLimitMinutes: 15,
  },
};

export class ClientSettings {
  constructor() {
    this.data = structuredClone(DEFAULT_SETTINGS);
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        Object.assign(this.data, saved);
        this.data.bindings = { ...DEFAULT_SETTINGS.bindings, ...(saved.bindings ?? {}) };
        this.data.host = { ...DEFAULT_SETTINGS.host, ...(saved.host ?? {}) };
        if (!this.data.exploreMap && this.data.hostMap) {
          this.data.exploreMap = this.data.hostMap;
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
  }

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
  }

  get skinName() {
    return `skin${String(this.data.skinIndex).padStart(2, '0')}`;
  }

  applyToPlayer(player) {
    player.name = this.data.playerName.slice(0, 31);
    player.skin = this.skinName;
    player.decals = {
      red: [...this.data.decals.red],
      green: [...this.data.decals.green],
      blue: [...this.data.decals.blue],
    };
    player.weaponID = this.data.primaryWeapon;
    player.meleeWeaponID = this.data.meleeWeapon;
    player.pendingWeaponID = this.data.primaryWeapon;
    player.pendingMeleeWeaponID = this.data.meleeWeapon;
  }
}
