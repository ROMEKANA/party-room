import {TIERS, startProblem, totalCards} from '../web/config.js';
import {draw, shuffle} from './draw.js';
import {connected, requireGame} from './room.js';
import {TOPICS} from './topics.js';

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
  const {mode, cardsPerPlayer} = settings;
  const parent = mode === 1 ? null : ids.includes(settings.nominatedParent)
    ? settings.nominatedParent : rotate(s,'parent',ids);
  if (mode !== 1) s.settings.nominatedParent = null;
  const children = ids.filter(id => id !== parent);
  const setter = mode === 1 ? rotate(s,'setter',ids) : children.includes(s.previousParent)
    ? s.previousParent : shuffle(children)[0];
  if (parent) s.previousParent = parent;
  const order = shuffle(children);
  const tiers = TIERS[settings.difficulty];
  const cards = draw(settings, totalCards(settings, ids.length)).map((answer, i) => ({
    id:crypto.randomUUID(), owner:order[i % order.length], word:null, answer, placed:null, fixed:false,
  }));
  s.round = {
    id:crypto.randomUUID(), phase:'topic', version:0, mode, ids, parent, setter, settings,
    tiers, cards, turn:0, topic:null, candidate:settings.topicSource === 'random' ? randomTopic() : null,
    lives:mode === 1 ? settings.mode1Lives : mode === 3 ? 1 : null,
    misses:0, history:[], excluded:[], proposal:null, votes:{}, feedback:null, result:null, attempts:0, queue:[],
  };
}
const randomTopic = () => TOPICS[Math.floor(Math.random() * TOPICS.length)];
export function topicAction(r, id, action) {
  requireGame(r.phase === 'topic' && id === r.setter, 'お題を決められるのは担当者です。');
  if (action.type === 'reroll') {
    requireGame(r.settings.topicSource === 'random', '自由入力のお題です。');
    r.candidate = randomTopic();
    r.version++;
  } else {
    r.topic = r.settings.topicSource === 'random' ? r.candidate : clean(action.word, 60);
    requireGame(r.topic, 'お題を1〜60文字で入力してください。', 400);
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
  return card;
}
export const finish = (r, win) => {
  r.result = {win};
  phase(r, 'result');
};
