export function remainingCards(total, placedCount) {
  return total - placedCount;
}

export function placementProblem(tiers, placements, total) {
  if (remainingCards(total, placements.length)) return 'すべてのカードを配置してください。';
  const used = new Set(placements);
  const missing = tiers.filter(tier => !used.has(tier));
  return missing.length ? 'すべてのランクに1枚以上配置してください。未使用：'+missing.join('、') : '';
}
