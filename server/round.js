import {TIERS, startProblem, totalCards} from '../web/config.js';
import {draw, shuffle} from './draw.js';
import {connected, requireGame} from './room.js';
import {randomTopic} from './topics.js';

function rotate(s, key, ids) {
  const cycle = s.rotation[key] ?? {used:[], queue:[]};
  cycle.queue = cycle.queue.filter(id => ids.includes(id));
  cycle.queue.push(...shuffle(ids.filter(id => !cycle.used.includes(id) && !cycle.queue.includes(id))));
  if (!cycle.queue.length) {
    cycle.used = [];
    cycle.queue = shuffle(ids);
  }
  const id = cycle.queue.shift();
  cycle.used.push(id);
  s.rotation[key] = cycle;
  return id;
}
export function phase(r, value) {
  r.phase = value;
  r.version++;
}
export function start(s, now) {
  s.players = s.players.filter(p => !p.left);
  const settings = {...s.settings};
  const ids = connected(s, now).map(p => p.id);
  const issue = startProblem(settings, ids.length);
  requireGame(!issue, issue);
  const {mode} = settings;
  const pickedParent = mode !== 1 && ids.includes(settings.nominatedParent) ? settings.nominatedParent : null;
  const parent = mode === 1 ? null : pickedParent ?? rotate(s,'parent',ids);
  const children = ids.filter(id => id !== parent);
  let setter;
  if (mode === 1) {
    setter = ids.includes(settings.nominatedMode1Setter) ? settings.nominatedMode1Setter : rotate(s,'setter',ids);
    s.settings.nominatedMode1Setter = null;
  } else {
    if (pickedParent && children.includes(settings.nominatedSetter)) setter = settings.nominatedSetter;
    else setter = children.includes(s.previousParent) ? s.previousParent : shuffle(children)[0];
    s.settings.nominatedParent = null;
    s.settings.nominatedSetter = null;
    s.previousParent = parent;
  }
  // Shuffle once, then repeat the same order for each pass through the players.
  const order = shuffle(children);
  const tiers = TIERS[settings.difficulty];
  const cards = draw(settings, totalCards(settings, ids.length)).map((answer, i) => ({
    id:crypto.randomUUID(), owner:order[i % order.length], word:null, answer, placed:null, fixed:false,
  }));
  s.round = {
    id:crypto.randomUUID(), phase:'topic', version:0, mode, ids, parent, setter, settings,
    tiers, cards, turn:0, topic:null, candidate:randomTopic(),
    scores:mode === 1 && settings.mode1Scoring ? Object.fromEntries(ids.map(id => [id,0])) : null,
    lives:mode === 1 ? settings.mode1Lives : mode === 3 ? 1 : null,
    misses:0, history:[], excluded:[], proposal:null, votes:{}, feedback:null, result:null, attempts:0, queue:[],
  };
}
export function topicAction(r, id, action) {
  requireGame(r.phase === 'topic' && id === r.setter, 'お題を決められるのは担当者です。');
  if (action.type === 'reroll') {
    r.candidate = randomTopic(r.candidate);
    r.version++;
  } else {
    // Old tabs omitted source and only sent word when using free text.
    const source = action.source ?? (Object.hasOwn(action,'word') ? 'custom' : 'random');
    requireGame(source === 'random' || source === 'custom', 'お題の選び方が無効です。', 400);
    const topic = source === 'random' ? r.candidate : clean(action.word, 60);
    requireGame(topic, 'お題を1〜60文字で入力してください。', 400);
    r.topic = topic;
    phase(r, 'input');
  }
}
export function clean(value, max) {
  if (typeof value !== 'string') return '';
  const word = value.trim();
  return [...word].length <= max && !/[\p{Cc}]/u.test(word) ? word : '';
}
export function currentInput(r, id) {
  if (r.phase !== 'input') return null;
  if (r.mode === 1) return r.cards[r.turn].owner === id ? r.cards[r.turn] : null;
  return r.cards.find(c => c.owner === id && !c.word) ?? null;
}
export function writeCard(r, id, action) {
  const card = currentInput(r,id);
  requireGame(card?.id && card.id === action.card, '現在の入力カードが変わりました。');
  const word = clean(action.word, 60);
  requireGame(word, '単語を1〜60文字で入力してください。', 400);
  requireGame(!r.cards.some(c => c.word === word), '同じ単語が提出済みです。', 400);
  card.word = word;
  if (r.mode === 2) card.submissionOrder = r.cards.filter(c => c.word).length;
  return card;
}
export function placeCard(r, card, tier) {
  r.placementSequence = (r.placementSequence ?? 0) + 1;
  card.position = r.placementSequence;
  card.placed = tier;
}
export function orderedCards(r, peek = false) {
  const order = peek ? 'submissionOrder' : 'position';
  const cards = r.cards.filter(c => c.word).sort((a,b) => {
    const byPlacement = (a[order] ?? 0) - (b[order] ?? 0);
    // For an in-progress round from an older release, keep the former concealed order.
    if (r.mode === 3 && a[order] == null && b[order] == null) return a.id.localeCompare(b.id);
    return byPlacement;
  });
  return r.tiers.flatMap(tier => cards.filter(c => (peek ? c.answer : c.placed) === tier));
}
export function lifeStatus(r) {
  if (r.mode === 1) return {lives:r.lives,initialLives:r.settings.mode1Lives};
  if (r.mode === 3) return {lives:r.lives,initialLives:1};
  if (r.settings.mode2Rule === 'accuracy') {
    return {lives:r.result?.win === false ? 0 : 1,initialLives:1};
  }
  const initialLives = r.settings.mode2Attempts;
  const failedAttempts = r.attempts - Number(r.feedback?.win === true);
  return {lives:Math.max(0,initialLives - failedAttempts),initialLives};
}
export const finish = (r, win) => {
  r.result = {win};
  phase(r, 'result');
};
