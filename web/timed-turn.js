import {el} from './board.js';

export const turnIsOpen = (round,now) => ['prepare','select'].includes(round.phase) &&
  now >= round.startsAt && (round.endsAt === null || now < round.endsAt);

export const turnTimeLabel = (round,now) => now < round.startsAt ? 'ターン開始待ち' :
  !turnIsOpen(round,now) ? '結果を確定中' :
    round.endsAt === null ? '制限時間なし' : Math.ceil((round.endsAt-now)/1000)+'秒';

export function turnTimeFraction(round,now) {
  if (round.phase === 'closing') return 0;
  return Math.min(1,Math.max(0,(round.endsAt-now)/(round.endsAt-round.startsAt)));
}

export function timedTurnUI(root, {serverNow,onOpenChange,onFrame,reserveTrack = false,signal}) {
  const header = el('div','timed-turn');
  const heading = el('div','timed-turn-heading');
  const title = el('strong');
  const clock = el('span','timed-turn-clock');
  const track = el('div','progress-track timed-turn-track');
  const bar = el('div','timed-turn-bar');
  heading.append(title,clock);
  track.append(bar);
  header.append(heading,track);
  root.append(header);

  let round, turnTitle, phaseLabel, wasOpen, frame;
  let disposed = false;
  const isOpen = () => Boolean(!disposed && round && phaseLabel === null && turnIsOpen(round,serverNow()));

  function paint() {
    frame = undefined;
    const now = serverNow();
    const selecting = phaseLabel === null;
    const open = selecting && turnIsOpen(round,now);
    const text = typeof turnTitle === 'function' ? turnTitle(now) : turnTitle;
    const label = phaseLabel ?? turnTimeLabel(round,now);
    if (title.textContent !== text) title.textContent = text;
    if (clock.textContent !== label) clock.textContent = label;

    const showTrack = selecting && round.endsAt !== null;
    track.hidden = !reserveTrack && !showTrack;
    track.style.visibility = reserveTrack && !showTrack ? 'hidden' : '';
    if (showTrack) bar.style.transform = 'scaleX('+turnTimeFraction(round,now)+')';

    if (wasOpen !== open) {
      wasOpen = open;
      onOpenChange?.(open);
    }
    const animating = onFrame?.(now);
    const waiting = selecting && (now < round.startsAt || (open && round.endsAt !== null));
    if (!disposed && (animating || waiting)) frame = requestAnimationFrame(paint);
  }

  function dispose() {
    disposed = true;
    cancelAnimationFrame(frame);
    signal?.removeEventListener('abort',dispose);
    round = null;
  }
  if (signal?.aborted) dispose();
  else signal?.addEventListener('abort',dispose,{once:true});

  return {
    isOpen,dispose,
    update(next, {title,label = null}) {
      if (disposed) return;
      cancelAnimationFrame(frame);
      round = next;
      turnTitle = title;
      phaseLabel = label;
      wasOpen = undefined;
      paint();
    },
  };
}
