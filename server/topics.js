export const TOPICS = [
  '好きな食べ物','好きな飲み物','おにぎりの具','朝食に食べたいもの',
  'コンビニで買いたいもの','お弁当に入っていたらうれしいもの','好きな果物',
  'お菓子としてうれしいもの','行ってみたい場所','旅行に持っていきたいもの',
  '無人島に持っていきたいもの','強そうな動物','怖い生き物','一緒に暮らしたい動物',
  '便利な家電','持っていると役立つ文房具','自分が使いたい特殊能力',
  'あったらうれしい休日の過ごし方','学校で楽しい行事','やってみたいアルバイト',
  'もらってうれしいプレゼント','一生無料ならうれしいもの',
  '映画の主人公に向いていそうな職業','雨の日にやりたいこと','寝起きに起こるとうれしいこと',
];

export function randomTopic(previous = null) {
  const alternatives = TOPICS.filter(topic => topic !== previous);
  return alternatives[Math.floor(Math.random() * alternatives.length)];
}
