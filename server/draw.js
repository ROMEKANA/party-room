import {TIERS} from '../web/config.js';
const WEIGHTS = {easy:[3,4,3],normal:[3,4,5,4,3],hard:[3,4,5,6,5,4,3]};
export function shuffle(values, ...fixedIndices) {
  // Draw callers can still supply a deterministic random function as the second argument.
  const random = typeof fixedIndices[0] === 'function' ? fixedIndices.shift() : Math.random;
  const fixed = new Set(fixedIndices);
  const copy = [...values];
  const positions = Array.from(copy.keys()).filter(index => !fixed.has(index));
  for (let i = positions.length - 1; i > 0; i--) {
    const a = positions[i], b = positions[Math.floor(random() * (i + 1))];
    [copy[a], copy[b]] = [copy[b], copy[a]];
  }
  return copy;
}
export function draw(settings, count, random = Math.random) {
  const tiers = TIERS[settings.difficulty];
  if (count < tiers.length) throw new RangeError('Insufficient cards');
  const cards = [...tiers];
  if (settings.randomMode === 'balanced') {
    while (cards.length + tiers.length <= count) cards.push(...tiers);
    cards.push(...shuffle(tiers, random).slice(0, count - cards.length));
  } else {
    const weights = settings.randomMode === 'random' ? tiers.map(() => 1) : WEIGHTS[settings.difficulty];
    const sum = weights.reduce((a,b) => a+b, 0);
    while (cards.length < count) {
      let roll = random() * sum;
      cards.push(tiers[weights.findIndex(weight => (roll -= weight) < 0)]);
    }
  }
  const mixed = shuffle(cards, random);
  if (settings.mode !== 1 || settings.difficulty !== 'hard' || !settings.edgePrerequisites) return mixed;
  const seen = new Set();
  const ordered = [];
  while (mixed.length) {
    const i = mixed.findIndex(tier => tier === 'SS' ? seen.has('S') : tier === 'E' ? seen.has('D') : true);
    const [tier] = mixed.splice(i, 1);
    ordered.push(tier);
    seen.add(tier);
  }
  return ordered;
}
