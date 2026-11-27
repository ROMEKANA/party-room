export const turnIsOpen = (round,now) => ['prepare','select'].includes(round.phase) &&
  now >= round.startsAt && (round.endsAt === null || now < round.endsAt);

export const turnTimeLabel = (round,now) => now < round.startsAt ? 'ターン開始待ち' :
  !turnIsOpen(round,now) ? '結果を確定中' :
    round.endsAt === null ? '制限時間なし' : Math.ceil((round.endsAt-now)/1000)+'秒';

export function turnTimeFraction(round,now) {
  if (round.phase === 'closing') return 0;
  return Math.min(1,Math.max(0,(round.endsAt-now)/(round.endsAt-round.startsAt)));
}
