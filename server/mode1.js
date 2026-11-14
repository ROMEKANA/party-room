import {requireGame} from './room.js';
import {finish, phase, placeCard, writeCard} from './round.js';

export function mode1(r, id, a, host) {
  const card = r.cards[r.turn];
  const eligible = r.ids.includes(id) && id !== card.owner;
  switch (a.type) {
    case 'word':
      writeCard(r, id, a);
      phase(r, 'placement');
      break;
    case 'propose':
      requireGame(r.phase === 'placement' && eligible && a.card === card.id &&
        r.tiers.includes(a.tier) && !r.excluded.includes(a.tier), 'このTierには提案できません。');
      r.feedback = null;
      r.proposal = {id:crypto.randomUUID(), tier:a.tier};
      r.votes = {};
      phase(r, 'vote');
      break;
    case 'vote': {
      requireGame(r.phase === 'vote' && eligible && a.proposal === r.proposal.id &&
        !Object.hasOwn(r.votes,id) && ['good','bad'].includes(a.choice), 'この候補には投票できません。');
      Object.defineProperty(r.votes,id,{value:a.choice, enumerable:true, writable:true, configurable:true});
      const votes = Object.values(r.votes);
      const eligibleCount = r.ids.length - 1;
      if (votes.filter(v => v === 'bad').length >= Math.ceil(eligibleCount / 2)) {
        r.proposal = null;
        r.feedback = {rejected:true};
        phase(r, 'placement');
      } else if (votes.length === eligibleCount) {
        judge(r,card);
      }
      break;
    }
    case 'next':
      requireGame(host && r.phase === 'turnResult', '次へ進めるのはホストです。');
      if (!card.fixed) {
        phase(r, 'placement');
      } else if (r.turn + 1 === r.cards.length) {
        finish(r, true);
      } else {
        r.turn++;
        r.excluded = [];
        r.votes = {};
        r.feedback = null;
        phase(r, 'input');
      }
      break;
    default: requireGame(false, 'このモードで使えない操作です。');
  }
}
function judge(r, card) {
  const tier = r.proposal.tier;
  const correct = tier === card.answer;
  r.proposal = null;
  r.feedback = {correct, tier, word:card.word};
  if (!correct) {
    r.lives--;
    r.misses++;
    r.excluded.push(tier);
    (r.history ??= []).push({word:card.word,tier,answer:card.answer});
  }
  if (correct && r.scores) {
    const voters = Object.keys(r.votes).filter(id => r.votes[id] === 'good');
    r.scores[card.owner] += voters.length;
    for (const id of voters) r.scores[id]++;
  }
  if (correct || r.settings.mode1Wrong === 'reveal') {
    placeCard(r,card,tier);
    card.fixed = true;
    r.feedback.answer = card.answer;
  }
  if (r.lives === 0) {
    if (!card.placed) placeCard(r,card,tier);
    finish(r, false);
  } else phase(r, 'turnResult');
}
