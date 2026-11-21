import {shuffle} from './draw.js';
import {requireGame} from './room.js';
import {placementProblem} from '../web/placement.js';

export function startPlacement(r) {
  r.displayOrder = shuffle(r.cards.map(card => card.id));
  if (r.mode === 2) r.queue = [...r.displayOrder];
}

export function currentCardId(round, placements) {
  return (placements ? round.displayOrder.find(id => !placements[id]) : round.queue[0]) ?? null;
}

export function placeNext(r, expected, action, place) {
  requireGame(expected && expected === action.card && r.tiers.includes(action.tier),
    '操作対象のカードが変わりました。');
  place(action.tier);
}

export function requireFullBoard(r, placements) {
  const problem = placementProblem(r.tiers, placements, r.cards.length);
  requireGame(!problem, problem, 409, 'incompleteBoard');
}
