import {DEFAULTS,hasParent} from '../web/config.js';
import {randomTopic} from './topics.js';
export const ONLINE_MS = 15_000;
export const HOST_GRACE_MS = 30_000;
export const HEARTBEAT_MS = 6_000;
export const initialRoom = () => ({
  settings:{...DEFAULTS,hasParent}, players:[], host:null, round:null, joinOrder:0,
  rotation:{parent:null, setter:null}, previousParent:null,
});
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
export function reconcile(s, now) {
  if (s.round?.phase === 'topic' && !s.round.candidate) s.round.candidate = randomTopic();
  if (!s.round) s.players = s.players.filter(p => !p.left && p.seen + ONLINE_MS + HOST_GRACE_MS > now);
  const host = s.players.find(p => p.id === s.host && !p.left);
  if (!host || host.seen + ONLINE_MS + HOST_GRACE_MS <= now) {
    s.host = connected(s, now)[0]?.id ?? null;
  }
  if (!s.round && !s.players.length) Object.assign(s, initialRoom());
}
export function join(s, name, now, token) {
  const id = typeof name === 'string' ? name.trim().normalize('NFC') : '';
  requireGame(id && [...id].length <= 20 && !/[\p{Cc}]/u.test(id), '名前を1〜20文字で入力してください。', 400);
  let p = s.players.find(person => person.id === id);
  if (p && s.round?.mode === 4 && s.round.phase !== 'result' && s.round.ids.includes(id)) {
    requireGame(p.token && token === p.token, '対戦中の名前です。参加したタブから再接続してください。', 409, 'nameInUse');
    p.seen = Math.max(p.seen,now);
    return p;
  }
  if (!p) {
    requireGame(s.players.length < 10, '満員です。同じ名前での復帰は可能です。', 409, 'full');
    const used = new Set(s.players.map(person => person.color));
    p = {id, color:Array.from({length:10}, (_,i) => i).find(i => !used.has(i)), order:++s.joinOrder};
    s.players.push(p);
  }
  p.token = crypto.randomUUID();
  p.seen = now;
  p.left = false;
  p.last = [];
  s.host ??= id;
  return p;
}
export function leave(s, p, now) {
  p.left = true;
  p.token = null;
  if (s.host === p.id) s.host = connected(s, now)[0]?.id ?? null;
  if (s.settings.nominatedParent === p.id) {
    s.settings.nominatedParent = null;
    s.settings.nominatedSetter = null;
  }
  for (const key of ['nominatedMode1Setter','nominatedSetter']) {
    if (s.settings[key] === p.id) s.settings[key] = null;
  }
  if (s.round?.mode === 4 && s.round.phase !== 'result' && s.round.ids.includes(p.id) &&
      !s.round.drafts?.[s.round.ids.indexOf(p.id)]?.final) s.round = null;
  if (!s.round?.ids.includes(p.id)) s.players = s.players.filter(person => person !== p);
  if (s.players.every(person => person.left)) Object.assign(s, initialRoom());
}
export function settingsFor(s, patch, now) {
  requireGame(patch && typeof patch === 'object' && !Array.isArray(patch), '設定が無効です。', 400);
  const next = {...DEFAULTS,...s.settings};
  delete next.topicSource;
  const nominees = [null,...connected(s,now).map(p => p.id)];
  const choices = {
    mode:[1,2,3,4], difficulty:['easy','normal','hard'], randomMode:['random','balanced','centerWeighted'],
    peekBoardWhileTyping:[true,false], edgePrerequisites:[true,false], mode1Wrong:['reveal','retry'], mode1Scoring:[true,false], mode2Rule:['perfect','accuracy'],
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
  if (!next.nominatedParent ||
      (Object.hasOwn(patch,'nominatedParent') && next.nominatedParent === next.nominatedSetter &&
        !Object.hasOwn(patch,'nominatedSetter'))) next.nominatedSetter = null;
  if (patch.nominatedSetter != null) {
    requireGame(hasParent(next.mode) && next.nominatedParent && next.nominatedParent !== patch.nominatedSetter,
      '親を指名してから、親以外の人をお題担当に選んでください。');
  }
  return next;
}
