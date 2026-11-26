import {DEFAULTS,hasParent,rightNeighbor} from '../web/config.js';
import {DEFAULT_HISTORY_MINUTES,TIER} from '../web/games.js';
import {randomTopic} from './topics.js';
export const ONLINE_MS = 15_000;
export const HOST_GRACE_MS = 30_000;
export const HEARTBEAT_MS = 6_000;
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
}
function resetEmpty(s) {
  const settings = {...s.settings,nominatedParent:null,nominatedMode1Setter:null,nominatedSetter:null};
  Object.assign(s,initialRoom(),{settings,common:s.common,legacyRound:null,nominees:{}});
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
const memberIds = s => s.players.filter(p => !p.left).map(p => p.id);
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
  if (!s.round) alignRoles(s);
}

export function reconcile(s, now) {
  if (s.round?.phase === 'topic' && !s.round.candidate) s.round.candidate = randomTopic();
  if (!s.round) s.players = s.players.filter(p => !p.left && p.seen + ONLINE_MS + HOST_GRACE_MS > now);
  const host = s.players.find(p => p.id === s.host && !p.left);
  if (!host || host.seen + ONLINE_MS + HOST_GRACE_MS <= now) {
    s.host = connected(s, now)[0]?.id ?? null;
  }
  if (!s.round && !s.players.length && (s.game || s.scope || s.selectedGame !== TIER)) resetEmpty(s);
  reconcileNominees(s);
}
export function join(s, name, now, token) {
  const id = typeof name === 'string' ? name.trim().normalize('NFC') : '';
  requireGame(id && [...id].length <= 20 && !/[\p{Cc}]/u.test(id), '名前を1〜20文字で入力してください。', 400);
  let p = s.players.find(person => person.id === id);
  if (p?.token && token === p.token && s.round?.mode === 4 && s.round.phase !== 'result' && s.round.ids.includes(id)) {
    p.seen = Math.max(p.seen,now);
    return p;
  }
  if (!p) {
    requireGame(s.players.length < 10, '満員です。同じ名前での復帰は可能です。', 409, 'full');
    const used = new Set(s.players.map(person => person.color));
    p = {id, color:Array.from({length:10}, (_,i) => i).find(i => !used.has(i))};
    s.players.push(p);
  }
  p.token = crypto.randomUUID();
  p.seen = now;
  p.left = false;
  p.last = [];
  s.host ??= id;
  reconcileNominees(s);
  return p;
}
export function leave(s, p, now) {
  p.left = true;
  p.token = null;
  if (s.host === p.id) s.host = connected(s, now)[0]?.id ?? null;
  if (s.round?.mode === 4 && s.round.phase !== 'result' && s.round.ids.includes(p.id) &&
      !s.round.drafts?.[s.round.ids.indexOf(p.id)]?.final) s.round = null;
  if (!s.round?.ids.includes(p.id)) s.players = s.players.filter(person => person !== p);
  if (s.players.every(person => person.left)) resetEmpty(s);
  else reconcileNominees(s);
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
