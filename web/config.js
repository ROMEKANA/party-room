export const COLORS = {
  SS: '#e7a9c3', S: '#f1a7a2', A: '#efc094', B: '#e9d78f',
  C: '#b9d3b2', D: '#b7cbdc', E: '#c9c0dc',
};
export const TIERS = {
  easy: ['A', 'B', 'C'], normal: ['S', 'A', 'B', 'C', 'D'],
  hard: ['SS', 'S', 'A', 'B', 'C', 'D', 'E'],
};
export const MODES = {1:'みんなでtier表', 2:'tier並び当て', 3:'tierお題当て'};
export const DEFAULTS = {
  mode:1, difficulty:'normal', cardsPerPlayer:3, randomMode:'balanced',
  edgePrerequisites:true, mode1Lives:3, mode1Wrong:'reveal', mode1Scoring:false,
  mode2Rule:'perfect', mode2Attempts:3, mode2Target:70,
  mode2ShowAuthors:false, mode3ShowAuthors:false,
  peekBoardWhileTyping:true,
  nominatedParent:null, nominatedMode1Setter:null, nominatedSetter:null,
};
export const totalCards = (settings, count) =>
  Math.max(0, count - (settings.mode === 1 ? 0 : 1)) * settings.cardsPerPlayer;
export function startProblem(settings, count) {
  if (count < 2) return '開始には接続中のプレイヤーが2人以上必要です。';
  const short = TIERS[settings.difficulty].length - totalCards(settings, count);
  return short > 0 ? `全Tierへの配布には、あと${short}枚必要です。` : '';
}
