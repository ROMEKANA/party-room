import {phase,writeCard} from './round.js';
import {currentCardId,placeNext,requireFullBoard,startPlacement} from './placement.js';
import {requireGame} from './room.js';
import {remainingCards} from '../web/placement.js';

export function consensus(r, id, a) {
  if (a.type === 'word' || a.type === 'editWord') {
    writeCard(r,id,a,a.type === 'editWord');
    if (r.cards.every(card => card.word)) {
      startPlacement(r);
      r.drafts = r.ids.map(() => ({placed:{},final:false,revision:0}));
      phase(r,'placement');
    }
    return;
  }
  const draft = r.drafts?.[r.ids.indexOf(id)];
  requireGame(r.phase === 'placement' && draft && !draft.final, '確定済みのTier表は変更できません。');
  requireGame(draft.revision === a.draftRevision, 'あなたのTier表が更新されました。最新の画面で操作してください。', 409, 'stale');
  if (a.type === 'place') {
    if (Object.hasOwn(draft.placed,a.card)) {
      requireGame(r.tiers.includes(a.tier), 'このTierには配置できません。');
      delete draft.placed[a.card];
      draft.placed[a.card] = a.tier;
    } else {
      placeNext(r,currentCardId(r,draft.placed),a,tier => {draft.placed[a.card] = tier;});
    }
    draft.revision++;
  } else if (a.type === 'submit') {
    requireFullBoard(r,Object.values(draft.placed));
    draft.final = true;
    if (r.drafts.every(item => item.final)) {
      const boards = r.drafts.map(item => item.placed);
      const mismatched = r.displayOrder.filter(cardId => boards.some(board => board[cardId] !== boards[0][cardId]));
      r.result = {win:mismatched.length === 0, matched:r.cards.length - mismatched.length,mismatched,boards};
      phase(r,'result');
    }
  } else requireGame(false, 'この操作はできません。');
}

export function consensusProgress(r, id) {
  const index = r.ids.indexOf(id);
  if (index === -1) return null;
  if (r.phase === 'input') {
    return r.cards.filter(card => card.owner === id && !card.word).length || 'done';
  }
  if (r.phase === 'placement') {
    const draft = r.drafts[index];
    return draft.final ? 'done' : remainingCards(r.cards.length,Object.keys(draft.placed).length);
  }
  return null;
}

export function consensusCards(r) {
  const cards = new Map(r.cards.map(card => [card.id,card]));
  return r.displayOrder.map(id => cards.get(id));
}

export function consensusView(r, id, input, players) {
  const view = {
    id:r.id, version:r.version, mode:r.mode, phase:r.phase, setter:r.setter, topic:r.topic,
    total:r.cards.length, cards:[], ...(r.phase === 'topic' && id === r.setter ? {candidate:r.candidate} : {}),
  };
  const index = r.ids.indexOf(id);
  if (r.phase === 'input' && index >= 0) {
    view.input = input ? {id:input.id,tier:input.answer} : null;
    view.inputRemaining = r.cards.filter(card => card.owner === id && !card.word).length;
    view.ownCards = r.cards.filter(card => card.owner === id && card.word)
      .map(({id,word,answer}) => ({id,word,answer}));
    view.cardsPerPlayer = r.settings.cardsPerPlayer;
  } else if (r.phase === 'placement' && index >= 0) {
    const {placed,final,revision} = r.drafts[index];
    view.final = final;
    const cards = consensusCards(r);
    const cardView = ({id,word,owner}) => ({id,word,...(r.settings.mode4ShowAuthors ? {owner} : {})});
    const byId = new Map(cards.map(card => [card.id,card]));
    // Keep returning the requester's own board after submission.
    view.cards = Object.entries(placed).map(([id,tier]) => ({...cardView(byId.get(id)),placed:tier}));
    view.remaining = remainingCards(r.cards.length,view.cards.length);
    if (!final) {
      const next = currentCardId(r,placed);
      view.current = next ? cardView(byId.get(next)) : null;
      view.displayOrder = r.displayOrder;
      // Names are common, but the only placement map is the requester's.
      view.unplaced = cards.filter(card => !placed[card.id]).map(cardView);
      view.draftRevision = revision;
      view.canPlace = true;
      view.canSubmit = !next;
      view.excluded = [];
    }
  } else if (r.phase === 'result') {
    view.cards = consensusCards(r).map(({id,word,owner,answer}) => ({id,word,owner,answer}));
    view.result = r.result;
    view.players = r.ids.map(id => ({id,color:players.find(player => player.id === id)?.color}));
  }
  return view;
}
