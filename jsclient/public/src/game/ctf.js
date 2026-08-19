// CTF flag logic — ServerCTF.cpp (local sandbox server).
import {
  GAME_TYPE_CTF, PLAYER_TEAM_BLUE, PLAYER_TEAM_RED, PLAYER_STATUS_ALIVE,
  SV_WIN_LIMIT,
} from './constants.js';

export const FLAG_AT_POD = -2;
export const FLAG_DROPPED = -1;

export class CTFState {
  constructor() {
    /** @type {[number, number]} -2 pod, -1 dropped, >=0 carrier playerID */
    this.flagState = [FLAG_AT_POD, FLAG_AT_POD];
    this.flagPos = [[0, 0, 0.25], [0, 0, 0.25]];
    this.blueWin = 0;
    this.redWin = 0;
    this.flagAnim = 0;
  }

  reset(map) {
    this._pod = [[...map.flagPod[0]], [...map.flagPod[1]]];
    this.flagState = [FLAG_AT_POD, FLAG_AT_POD];
    this.flagPos = [
      [...map.flagPod[0]],
      [...map.flagPod[1]],
    ];
    this.flagPos[0][2] = 0.25;
    this.flagPos[1][2] = 0.25;
    this.blueWin = 0;
    this.redWin = 0;
    this.flagAnim = 0;
  }

  updatePositions(players) {
    for (let i = 0; i < 2; i++) {
      const st = this.flagState[i];
      if (st === FLAG_AT_POD) {
        this.flagPos[i] = [...this._pod[i]];
        this.flagPos[i][2] = 0.25;
      } else if (st >= 0) {
        const carrier = players.find((p) => p.playerID === st);
        if (carrier) {
          this.flagPos[i] = [...carrier.currentCF.position];
          this.flagPos[i][2] = 0.25;
        }
      }
    }
  }

  init(map) {
    this.reset(map);
  }

  update(delay, game) {
    if (game.gameType !== GAME_TYPE_CTF || !game.map) return;
    this.flagAnim += delay * 10;
    if (this.flagAnim >= 10) this.flagAnim -= 10;
    this.updatePositions(game.players);
    this.tickBlueFlag(game);
    this.tickRedFlag(game);
    this.updatePositions(game.players);
  }

  tickBlueFlag(game) {
    const { map, players, audio, ui } = game;
    const pod = map.flagPod[0];

    if (this.flagState[0] === FLAG_AT_POD) {
      for (const p of players) {
        if (p.teamID !== PLAYER_TEAM_RED || p.status !== PLAYER_STATUS_ALIVE) continue;
        if (distSq2(p, pod) <= 0.25 * 0.25) {
          this.flagState[0] = p.playerID;
          p.flagAttempts = (p.flagAttempts ?? 0) + 1;
          audio?.play3D('ftook.wav', p.currentCF.position, { range: 8, volume: 255 });
          ui?.addEvent('\x03> ' + p.name + ' took the blue flag');
          return;
        }
        if (
          p.teamID === PLAYER_TEAM_BLUE &&
          p.status === PLAYER_STATUS_ALIVE &&
          this.flagState[1] === p.playerID &&
          distSq2(p, pod) <= 0.25 * 0.25
        ) {
          this.capture(game, p, PLAYER_TEAM_BLUE);
          return;
        }
      }
    } else if (this.flagState[0] === FLAG_DROPPED) {
      for (const p of players) {
        if (p.status !== PLAYER_STATUS_ALIVE) continue;
        const dDrop = distSq2(p, this.flagPos[0]);
        if (p.teamID === PLAYER_TEAM_RED && dDrop <= 0.5 * 0.5) {
          this.flagState[0] = p.playerID;
          p.flagAttempts = (p.flagAttempts ?? 0) + 1;
          audio?.play3D('ftook.wav', p.currentCF.position, { range: 8, volume: 255 });
          ui?.addEvent('\x03> ' + p.name + ' took the blue flag');
          return;
        }
        if (p.teamID === PLAYER_TEAM_BLUE && dDrop <= 0.5 * 0.5) {
          this.flagState[0] = FLAG_AT_POD;
          p.returns = (p.returns ?? 0) + 1;
          audio?.play3D('return.wav', p.currentCF.position, { range: 8, volume: 255 });
          ui?.addEvent('\x03> ' + p.name + ' returned the blue flag');
          return;
        }
      }
    }
  }

  tickRedFlag(game) {
    const { map, players, audio, ui } = game;
    const pod = map.flagPod[1];

    if (this.flagState[1] === FLAG_AT_POD) {
      for (const p of players) {
        if (p.teamID !== PLAYER_TEAM_BLUE || p.status !== PLAYER_STATUS_ALIVE) continue;
        if (distSq2(p, pod) <= 0.25 * 0.25) {
          this.flagState[1] = p.playerID;
          p.flagAttempts = (p.flagAttempts ?? 0) + 1;
          audio?.play3D('etook.wav', p.currentCF.position, { range: 8, volume: 255 });
          ui?.addEvent('\x03> ' + p.name + ' took the red flag');
          return;
        }
        if (
          p.teamID === PLAYER_TEAM_RED &&
          p.status === PLAYER_STATUS_ALIVE &&
          this.flagState[0] === p.playerID &&
          distSq2(p, pod) <= 0.25 * 0.25
        ) {
          this.capture(game, p, PLAYER_TEAM_RED);
          return;
        }
      }
    } else if (this.flagState[1] === FLAG_DROPPED) {
      for (const p of players) {
        if (p.status !== PLAYER_STATUS_ALIVE) continue;
        const dDrop = distSq2(p, this.flagPos[1]);
        if (p.teamID === PLAYER_TEAM_BLUE && dDrop <= 0.5 * 0.5) {
          this.flagState[1] = p.playerID;
          p.flagAttempts = (p.flagAttempts ?? 0) + 1;
          audio?.play3D('etook.wav', p.currentCF.position, { range: 8, volume: 255 });
          ui?.addEvent('\x03> ' + p.name + ' took the red flag');
          return;
        }
        if (p.teamID === PLAYER_TEAM_RED && dDrop <= 0.5 * 0.5) {
          this.flagState[1] = FLAG_AT_POD;
          p.returns = (p.returns ?? 0) + 1;
          audio?.play3D('return.wav', p.currentCF.position, { range: 8, volume: 255 });
          ui?.addEvent('\x03> ' + p.name + ' returned the red flag');
          return;
        }
      }
    }
  }

  capture(game, scorer, team) {
    const { audio, ui } = game;
    if (team === PLAYER_TEAM_BLUE) {
      this.flagState[1] = FLAG_AT_POD;
      this.blueWin++;
      game.blueScore = this.blueWin;
      audio?.play2D('cheerBlueTeam.wav', 255);
      ui?.addEvent('\x01' + scorer.name + ' \x08scores for the Blue team!');
    } else {
      this.flagState[0] = FLAG_AT_POD;
      this.redWin++;
      game.redScore = this.redWin;
      audio?.play2D('cheerRedTeam.wav', 255);
      ui?.addEvent('\x04' + scorer.name + ' \x08scores for the Red team!');
    }
    scorer.score = (scorer.score ?? 0) + 1;
    if (this.blueWin >= SV_WIN_LIMIT || this.redWin >= SV_WIN_LIMIT) {
      ui?.addEvent('\x03Match over — press Esc for menu');
    }
  }

  dropCarrierFlags(player, game) {
    for (let i = 0; i < 2; i++) {
      if (this.flagState[i] === player.playerID) {
        this.flagState[i] = FLAG_DROPPED;
        this.flagPos[i] = [...player.currentCF.position];
        this.flagPos[i][2] = 0.25;
        game.ui?.addEvent('\x07' + player.name + ' dropped the ' + (i === 0 ? 'blue' : 'red') + ' flag');
      }
    }
  }

  carrierFlagId(playerID) {
    if (this.flagState[0] === playerID) return 0;
    if (this.flagState[1] === playerID) return 1;
    return -1;
  }
}

function distSq2(player, pos) {
  const dx = player.currentCF.position[0] - pos[0];
  const dy = player.currentCF.position[1] - pos[1];
  return dx * dx + dy * dy;
}

export function mapSupportsCTF(map) {
  const a = map.flagPod[0];
  const b = map.flagPod[1];
  return (a[0] !== 0 || a[1] !== 0) && (b[0] !== 0 || b[1] !== 0);
}
