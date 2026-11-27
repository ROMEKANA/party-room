import {el} from './board.js';

export function consensusBoard(r, player) {
  const placements = r.result.boards[r.players.findIndex(p => p.id === player)];
  const byId = new Map(r.cards.map(card => [card.id,card]));
  const mismatched = new Set(r.result.mismatched);
  return Object.entries(placements).map(([id,placed]) => {
    const {word,owner,answer:assignedTier} = byId.get(id);
    return {id,word,owner,assignedTier,placed,mismatch:mismatched.has(id)};
  });
}

export const consensusOutcome = result => '全員一致：'+(result.win ? 'クリア！' : '失敗');
export const consensusCount = r => r.result.matched+' / '+r.total+' 枚一致';

export function consensusDetail(root,r,card) {
  root.append(el('p','dialog-word',card.word),
    el('p','dialog-copy','投稿者：'+card.owner),
    el('p','dialog-copy','指定Tier：'+card.assignedTier),
    el('strong','dialog-copy',card.mismatch?'判定：不一致':'判定：一致'));
  const list = el('dl','draw-help consensus-tiers');
  r.players.forEach((player,i) => list.append(el('dt','',player.id),el('dd','',r.result.boards[i][card.id])));
  root.append(list);
}
