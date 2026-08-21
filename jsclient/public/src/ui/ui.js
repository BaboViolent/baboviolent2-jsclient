// In-game UI state: console, chat, kill feed, scoreboard (Client.cpp / Console.cpp / ClientRender.cpp).
import {
  WEAPONS, CHAT_TEAM_ALL, PLAYER_TEAM_SPECTATOR, GAME_TYPE_CTF, GAME_TYPE_TDM,
} from '../game/constants.js';
import { parseColorRuns } from './colors.js';

const MAX_CHAT = 12;
const MAX_EVENTS = 8;
const MAX_CONSOLE = 200;
const EVENT_DURATION = 5;

export class TimedMessage {
  constructor(message, duration = EVENT_DURATION) {
    this.message = message;
    this.duration = duration;
  }
}

export class GameUI {
  constructor(game) {
    this.game = game;
    this.chatMessages = [];
    this.eventMessages = [];
    this.consoleMessages = [];
    this.consoleActive = false;
    this.consoleEventsMode = true;
    this.chatActive = false;
    this.chatTeam = false;
    this.chatBuffer = '';
    this.consoleBuffer = '';
    this.showScoreboard = false;
    this.menuOpen = true;
    this.playing = false;
    this.vote = { active: false, from: '', command: '', yes: 0, no: 0, voted: false, remaining: 0 };
  }

  log(text) {
    this.consoleMessages.push(text);
    while (this.consoleMessages.length > MAX_CONSOLE) this.consoleMessages.shift();
  }

  addChat(text, team = false) {
    const prefix = team ? '\x03[team] ' : '';
    this.chatMessages.push(new TimedMessage(prefix + text, 12));
    while (this.chatMessages.length > MAX_CHAT) this.chatMessages.shift();
    this.log('\x07' + (team ? 'team' : 'say') + ': ' + text);
  }

  addEvent(text) {
    this.eventMessages.push(new TimedMessage(text, EVENT_DURATION));
    while (this.eventMessages.length > MAX_EVENTS) this.eventMessages.shift();
  }

  /** Player.cpp kill banner — weapon name with \x8 separator bytes. */
  addKill(killer, victim, weaponID) {
    if (!killer || !victim) return;
    const weapon = WEAPONS[weaponID]?.name ?? '???';
    const teamMode = this.game.gameType === GAME_TYPE_TDM || this.game.gameType === GAME_TYPE_CTF;
    const kTeam = teamMode ? (killer.teamID === 0 ? '{' : killer.teamID === 1 ? '}' : '') : '';
    const vTeam = teamMode ? (victim.teamID === 0 ? '{' : victim.teamID === 1 ? '}' : '') : '';
    const killerReset = teamMode ? '' : '\x09';
    const victimReset = teamMode ? '' : '\x09';
    this.addEvent(`${killerReset}${kTeam}${killer.name}\x08 ----- ${weapon} -----\x08 ${victimReset}${vTeam}${victim.name}`);
  }

  update(delay) {
    for (const list of [this.chatMessages, this.eventMessages]) {
      for (let i = list.length - 1; i >= 0; i--) {
        list[i].duration -= delay;
        if (list[i].duration <= 0) list.splice(i, 1);
      }
    }
    if (this.vote.active) this.vote.remaining = Math.max(0, this.vote.remaining - delay);
  }

  startVote(from, command) {
    this.vote = {
      active: true,
      from,
      command,
      yes: 0,
      no: 0,
      voted: this.game.thisPlayer?.teamID === PLAYER_TEAM_SPECTATOR,
      remaining: 30,
    };
  }

  updateVote(yes, no) {
    if (!this.vote.active) return;
    this.vote.yes = yes;
    this.vote.no = no;
  }

  finishVote(passed) {
    if (!this.vote.active) return;
    this.addEvent(`\x09Vote ${passed ? 'passed' : 'failed'}`);
    this.log(`\x09Vote ${passed ? 'passed' : 'failed'}`);
    this.vote.active = false;
  }

  castVote(yes) {
    if (!this.vote.active || this.vote.voted || !this.game.netClient) return false;
    this.game.netClient.castVote(yes);
    this.vote.voted = true;
    return true;
  }

  toggleConsole() {
    this.consoleActive = !this.consoleActive;
    if (this.consoleActive) {
      this.chatActive = false;
      this.menuOpen = false;
    }
    return this.consoleActive;
  }

  openChat(team = false) {
    if (this.consoleActive || this.menuOpen || !this.playing) return false;
    this.chatActive = true;
    this.chatTeam = team;
    this.chatBuffer = '';
    return true;
  }

  closeChat() {
    this.chatActive = false;
    this.chatBuffer = '';
  }

  submitChat() {
    const text = this.chatBuffer.trim();
    if (text) {
      if (this.game.onlineMode && this.game.netClient) {
        const teamId = this.chatTeam ? this.game.thisPlayer.teamID : CHAT_TEAM_ALL;
        this.game.netClient.sendChat(teamId, text);
      } else {
        this.addChat(text, this.chatTeam);
      }
    }
    this.closeChat();
  }

  /** Incoming NET_CLSV_SVCL_CHAT / SVCL_MSG with team filter. */
  addNetChat(text, teamId) {
    // ClientRecv.cpp:381 — anything above CHAT_TEAM_ALL is team-only, spectators included.
    const isTeamMsg = teamId >= PLAYER_TEAM_SPECTATOR;
    if (isTeamMsg && teamId !== this.game.thisPlayer.teamID) return;
    this.addChat(text, isTeamMsg);
  }

  submitConsole() {
    const line = this.consoleBuffer.trim();
    this.consoleBuffer = '';
    if (!line) return;
    this.log(`: ${line}`);
    this.runCommand(line);
  }

  /** Handle control keys delivered to the focused DOM text input. */
  handleTextInputKey(code) {
    if (code === 'Backquote') {
      this.toggleConsole();
      return true;
    }
    if (this.consoleActive) {
      if (code === 'Enter') this.submitConsole();
      else if (code === 'Escape') this.consoleActive = false;
      else if (code === 'F1') this.consoleEventsMode = true;
      else if (code === 'F2') this.consoleEventsMode = false;
      else return false;
      return true;
    }
    if (this.chatActive) {
      if (code === 'Enter') this.submitChat();
      else if (code === 'Escape') this.closeChat();
      else return false;
      return true;
    }
    return false;
  }

  runCommand(line) {
    const parts = line.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const game = this.game;

    switch (cmd) {
      case 'help':
        this.log('\x03Commands: help, clear, map, vote, say, sayteam, connect, disconnect');
        break;
      case 'clear':
        this.consoleMessages.length = 0;
        break;
      case 'map':
        if (parts[1] && game.onMapRequest) void game.onMapRequest(parts[1]);
        else this.log('\x04Usage: map <name>');
        break;
      case 'vote': {
        const command = parts.slice(1).join(' ');
        if (!command) this.log('\x04Usage: vote changemap <map> | vote set sv_gameType <0-3>');
        else if (!game.onlineMode || !game.netClient) this.log('\x04Voting requires an online server');
        else game.netClient.requestVote(command);
        break;
      }
      case 'say':
        if (parts.length > 1) {
          const msg = parts.slice(1).join(' ');
          if (game.onlineMode && game.netClient) game.netClient.sendChat(-1, msg);
          else this.addChat(msg, false);
        }
        break;
      case 'sayteam':
        if (parts.length > 1) {
          const msg = parts.slice(1).join(' ');
          if (game.onlineMode && game.netClient) game.netClient.sendChat(game.thisPlayer.teamID, msg);
          else this.addChat(msg, true);
        }
        break;
      case 'connect':
        if (window.bv2Connect) {
          const host = parts[1] ?? '127.0.0.1';
          const port = Number(parts[2]) || 8080;
          const pass = parts.slice(3).join(' ') || '';
          void window.bv2Connect(host, port, pass);
        } else this.log('\x04Not ready');
        break;
      case 'disconnect':
        if (window.bv2Disconnect) window.bv2Disconnect();
        else this.log('\x04Not connected');
        break;
      default:
        this.log('\x04Unknown command: ' + cmd);
    }
  }

  /** For DOM text input binding. */
  get activeInput() {
    if (this.consoleActive) return 'console';
    if (this.chatActive) return 'chat';
    return null;
  }

  get inputBuffer() {
    return this.consoleActive ? this.consoleBuffer : this.chatBuffer;
  }

  set inputBuffer(v) {
    if (this.consoleActive) this.consoleBuffer = v;
    else if (this.chatActive) this.chatBuffer = v;
  }

  get inputPrompt() {
    if (this.consoleActive) return this.consoleEventsMode ? 'console (F1 events / F2 chat log) > ' : 'console > ';
    if (this.chatActive) return this.chatTeam ? 'sayteam : ' : 'say : ';
    return '';
  }
}

export { parseColorRuns };
