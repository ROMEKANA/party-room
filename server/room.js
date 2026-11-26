import {DEFAULTS,hasParent,rightNeighbor} from '../web/config.js';
import {BATTLE,JOB_BATTLE,isBattle,CIRCLE,DEFAULT_HISTORY_MINUTES,GAMES,TIER} from '../web/games.js';
import {BATTLE_DEFAULTS} from '../web/battle-rules.js';
import {JOB_BATTLE_FIXED} from '../web/battle-jobs.js';
import {randomTopic} from './topics.js';
export const ONLINE_MS = 15_000;
export const HOST_GRACE_MS = 30_000;
export const HEARTBEAT_MS = 6_000;
const ROOM_MAX = 10;
export const initialRoom = () => ({
  settings:{...DEFAULTS}, players:[], host:null, round:null,
  game:null, selectedGame:TIER, scope:null, common:{historyMinutes:DEFAULT_HISTORY_MINUTES},
  rotation:{parent:null, setter:null}, previousParent:null,
});
export function prepareRoom(s) {
  if (!Object.hasOwn(s,'game')) {
    s.game = s.round ? TIER : null;
    s.selectedGame = TIER;
    s.scope = s.round?.id ?? null;
    if (s.round) s.legacyRound = s.round.id;
  }
  s.settings = {...DEFAULTS,...s.settings};
  s.common ??= {historyMinutes:DEFAULT_HISTORY_MINUTES};
  if (s.round && !s.round.colors) {
    s.round.colors = s.round.ids.map(id => s.players.find(p => p.id === id)?.color ?? 0);
  }
}
function resetEmpty(s) {
  const settings = {...s.settings,nominatedParent:null,nominatedMode1Setter:null,nominatedSetter:null};
  Object.assign(s,initialRoom(),{settings,common:s.common,legacyRound:null,nominees:{}});
  if (s.battleSettings) s.battleSettings.bossId = null;
  delete s.battleTeams;
  delete s.jobBattleTeams;
}
export class GameError extends Error {
  constructor(message, status = 409, code = 'invalid') {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function requireGame(ok, message, status, code) {
  if (!ok) throw new GameError(message, status, code);
}
export const isOnline = (p, now) => Boolean(p && !p.left && p.seen + ONLINE_MS > now);
export const connected = (s, now) => s.players.filter(p => isOnline(p, now));
function validNominees(ids, {setter, parent, nonParentSetter}) {
  setter = ids.includes(setter) ? setter : null;
  return {
    setter,
    parent: setter === null ? null : ids.includes(parent) && parent !== setter
      ? parent : rightNeighbor(ids,setter),
    nonParentSetter: ids.includes(nonParentSetter) ? nonParentSetter : null,
  };
}
export const members = s => s.players.filter(p => !p.left);
const memberIds = s => members(s).map(p => p.id);
export const playing = s => Boolean(s.round && s.round.phase !== (s.game === CIRCLE ? 'finished' : 'result'));

export function gameMembers(s) {
  const game = GAMES[s.game];
  if (!game) return [];
  const mode = isBattle(s.game) ? s[battleStorage(s.game).settings]?.mode : s.settings.mode;
  return members(s).slice(0,game.modeMax?.[mode] ?? game.max);
}

export function balanceTeams(ids, previous = {}) {
  const pink = (previous.pink ?? []).filter(id => ids.includes(id)).slice(0,Math.ceil(ids.length/2));
  const blue = (previous.blue ?? []).filter(id => ids.includes(id)).slice(0,Math.floor(ids.length/2));
  for (const id of ids) {
    if (!pink.includes(id) && !blue.includes(id)) {
      (pink.length < Math.ceil(ids.length/2) ? pink : blue).push(id);
    }
  }
  return {pink,blue};
}

export function battleStorage(game) {
  return game === JOB_BATTLE ? {settings:'jobBattleSettings',teams:'jobBattleTeams'} :
    {settings:'battleSettings',teams:'battleTeams'};
}

export function battleRoster(s, game = s.game) {
  const players = members(s);
  const keys = battleStorage(game);
  const settings = {...BATTLE_DEFAULTS,...s[keys.settings]};
  if (game === JOB_BATTLE) {
    Object.assign(settings,JOB_BATTLE_FIXED,{bossId:null});
    if (settings.mode === 'boss') settings.mode = BATTLE_DEFAULTS.mode;
  }
  const slots = players.slice(0,GAMES[BATTLE].modeMax.boss);
  if (!slots.some(player => player.id === settings.bossId)) settings.bossId = null;
  return {settings,teams:balanceTeams(players.map(player => player.id),s[keys.teams])};
}

function reconcileBattleRoster(s) {
  for (const game of [BATTLE,JOB_BATTLE]) {
    const keys = battleStorage(game);
    if (!s[keys.settings] && !s[keys.teams]) continue;
    const {settings,teams} = battleRoster(s,game);
    if (s[keys.settings]) s[keys.settings] = settings;
    if (s[keys.teams]) s[keys.teams] = teams;
  }
}

export function roundPlayers(s, now) {
  return s.round.ids.map((id,index) => ({
    id, color:s.round.colors[index], online:isOnline(s.players.find(p => p.id === id),now),
  }));
}
const currentNominees = settings => ({
  parent:settings.nominatedParent, setter:settings.nominatedSetter,
  nonParentSetter:settings.nominatedMode1Setter,
});
function setNominees(settings, {parent,setter,nonParentSetter}) {
  settings.nominatedParent = parent;
  settings.nominatedSetter = setter;
  settings.nominatedMode1Setter = nonParentSetter;
}

export function moveRolesFirst(players, setter, parent) {
  return [players.find(p => p.id === setter), players.find(p => p.id === parent),
    ...players.filter(p => p.id !== setter && p.id !== parent)];
}

export function alignRoles(s) {
  const {mode,nominatedSetter:setter,nominatedParent:parent} = s.settings;
  if (s.game === TIER && hasParent(mode) && setter !== null && parent !== null &&
      parent !== rightNeighbor(memberIds(s),setter)) {
    s.players = moveRolesFirst(s.players,setter,parent);
  }
}

function reconcileNominees(s) {
  const ids = memberIds(s);
  setNominees(s.settings,validNominees(ids,currentNominees(s.settings)));
  for (const [mode,entry] of Object.entries(s.nominees ?? {})) {
    s.nominees[mode] = validNominees(ids,entry ?? {});
  }
}

export const isExpired = (p,now) => p.seen + ONLINE_MS + HOST_GRACE_MS <= now;
function removeMember(s,p) {
  p.left = true;
  p.token = null;
  // Keep a departed match participant available for same-name recovery and legacy match views.
  if (!s.round?.ids.includes(p.id)) s.players = s.players.filter(person => person !== p);
}

export function reconcile(s, now) {
  for (const p of members(s)) {
    if (isExpired(p,now)) removeMember(s,p);
  }
  if (!members(s).length) {
    if (s.players.length || s.game || s.scope || s.round || s.host || s.selectedGame !== TIER) resetEmpty(s);
    return;
  }
  if (!members(s).some(p => p.id === s.host)) s.host = connected(s,now)[0]?.id ?? null;
  if (s.round?.phase === 'topic' && !s.round.candidate) s.round.candidate = randomTopic();
  reconcileNominees(s);
  reconcileBattleRoster(s);
}

export function join(s, name, now, token) {
  const id = typeof name === 'string' ? name.trim().normalize('NFC') : '';
  requireGame(id && [...id].length <= 20 && !/[\p{Cc}]/u.test(id), '名前を1〜20文字で入力してください。', 400);
  let p = s.players.find(person => person.id === id);
  if (p?.token && token === p.token && s.round?.mode === 4 && playing(s) && s.round.ids.includes(id)) {
    p.seen = Math.max(p.seen,now);
    return p;
  }
  const present = members(s);
  if (!p || p.left) {
    requireGame(present.length < ROOM_MAX, '満員です。同じ名前での復帰は可能です。', 409, 'full');
    const used = new Set(present.map(person => person.color));
    const free = Array.from({length:ROOM_MAX}, (_,i) => i).filter(color => !used.has(color));
    const historical = new Set(s.players.map(person => person.color));
    const color = p && free.includes(p.color) ? p.color : free.find(value => !historical.has(value)) ?? free[0];
    if (!p || !playing(s)) {
      s.players = s.players.filter(person => person !== p);
      p = {id,color};
      s.players.push(p);
    } else p.color = color;
  }
  p.token = crypto.randomUUID();
  p.seen = Math.max(p.seen ?? now,now);
  p.left = false;
  p.last = [];
  s.host ??= id;
  reconcileNominees(s);
  reconcileBattleRoster(s);
  return p;
}

export function leave(s, p, now) {
  if (s.round?.mode === 4 && playing(s) && s.round.ids.includes(p.id) &&
      !s.round.drafts?.[s.round.ids.indexOf(p.id)]?.final) {
    s.round = null;
    s.scope = crypto.randomUUID();
    s.legacyRound = null;
    s.players = members(s);
  }
  removeMember(s,p);
  if (!members(s).length) resetEmpty(s);
  else reconcile(s,now);
}
export function settingsFor(s, patch) {
  requireGame(patch && typeof patch === 'object' && !Array.isArray(patch), '設定が無効です。', 400);
  const next = {...DEFAULTS,...s.settings};
  delete next.topicSource;
  const ids = memberIds(s);
  const nominees = [null,...ids];
  const choices = {
    mode:[1,2,3,4], difficulty:['easy','normal','hard'], randomMode:['random','balanced','centerWeighted'],
    peekBoardWhileTyping:[true,false], edgePrerequisites:[true,false], mode1Wrong:['reveal','retry'], mode1Scoring:[true,false], mode1ConfirmTurn:[true,false], mode2Rule:['perfect','accuracy'],
    mode2ShowAuthors:[true,false], mode3ShowAuthors:[true,false], mode4ShowAuthors:[true,false],
    mode2Target:Array.from({length:10}, (_,i) => (i+1)*10),
    nominatedParent:nominees, nominatedMode1Setter:nominees, nominatedSetter:nominees,
  };
  const max = {cardsPerPlayer:10,mode1Lives:30,mode2Attempts:10};
  for (const [key, value] of Object.entries(patch)) {
    const ok = Object.hasOwn(choices,key) ? choices[key].includes(value) :
      Object.hasOwn(max,key) && Number.isInteger(value) && value >= 1 && value <= max[key];
    requireGame(ok, '設定値が範囲外です。', 400);
    next[key] = value;
  }
  if (next.mode !== s.settings.mode) {
    s.nominees ??= {};
    s.nominees[s.settings.mode] = currentNominees(s.settings);
    setNominees(next,validNominees(ids,s.nominees[next.mode] ?? {}));
    for (const key of ['nominatedMode1Setter','nominatedSetter','nominatedParent']) {
      if (Object.hasOwn(patch,key)) next[key] = patch[key];
    }
  }
  if (patch.nominatedSetter != null) {
    requireGame(hasParent(next.mode),'このモードに親はありません。');
  }
  if (patch.nominatedParent != null) {
    requireGame(hasParent(next.mode) && next.nominatedSetter && next.nominatedSetter !== patch.nominatedParent,
      'お題担当を指名してから、お題担当以外の人を親に選んでください。');
  }
  if (Object.hasOwn(patch,'nominatedSetter') && !Object.hasOwn(patch,'nominatedParent')) {
    next.nominatedParent = rightNeighbor(ids,next.nominatedSetter);
  }
  setNominees(next,validNominees(ids,currentNominees(next)));
  return next;
}
