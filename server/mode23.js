import {currentCardId,placeNext,requireFullBoard,startPlacement} from './placement.js';
import {isOnline, requireGame} from './room.js';
import {attemptLimit, finish, phase, placeCard, writeCard} from './round.js';

export function judgeId(s, r, now) {
  const online = id => isOnline(s.players.find(p => p.id === id),now);
  if (online(r.setter)) return r.setter;
  return r.ids.find(id => id !== r.parent && online(id)) ?? null;
}
export function mode23(s, r, id, a, host, now) {
  if (a.type === 'word') {
    const card = writeCard(r,id,a);
    if (r.mode === 3) {
      placeCard(r,card,card.answer);
      card.fixed = true;
    }
    if (r.cards.every(c => c.word)) {
      if (r.mode === 2) startPlacement(r);
      phase(r, r.mode === 2 ? 'placement' : 'oral');
    }
    return;
  }
  if (r.mode === 3) {
    requireGame(a.type === 'judge' && r.phase === 'oral' && id === judgeId(s,r,now) &&
      typeof a.win === 'boolean', '判定できるのはお題の担当者です。');
    if (!a.win) r.lives = 0;
    finish(r,a.win);
    return;
  }
  if (a.type === 'next') {
    requireGame(host && r.phase === 'attemptResult', '判定から進めるのはホストです。');
    if (r.feedback.done) finish(r,r.feedback.win);
    else phase(r,'placement');
    return;
  }
  requireGame(id === r.parent && r.phase === 'placement', '配置できるのは推理中の親です。');
  const card = r.cards.find(c => c.id === a.card);
  if (a.type === 'place') {
    placeNext(r,currentCardId(r),a,tier => placeCard(r,card,tier));
    r.queue.shift();
    r.version++;
  } else if (a.type === 'select') {
    requireGame(card?.placed, '配置済みのカードを選択してください。');
    if (r.queue.length) r.queue.push(r.queue.shift());
    card.placed = null;
    r.queue.unshift(card.id);
    r.version++;
  } else if (a.type === 'submit') {
    requireFullBoard(r,r.cards.map(c => c.placed).filter(Boolean));
    const score = r.cards.filter(c => c.placed === c.answer).length;
    const accuracy = r.settings.mode2Rule === 'accuracy';
    r.attempts++;
    const win = accuracy ? score * 100 >= r.settings.mode2Target * r.cards.length : score === r.cards.length;
    r.feedback = {score, win, done:win || r.attempts >= attemptLimit(r)};
    if (accuracy && r.feedback.done) finish(r,win);
    else phase(r,'attemptResult');
  } else requireGame(false, 'この操作はできません。');
}
