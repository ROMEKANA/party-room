export function beginTimedTurn(round, now) {
  round.turn++;
  round.phase = 'prepare';
  round.startsAt = now + round.settings.readyMs;
  round.endsAt = round.settings.seconds === null ? null : round.startsAt + round.settings.seconds * 1000;
  round.closesAt = null;
  round.moves = {};
  round.version++;
}

export function advanceTimedSelection(round, now, allReady) {
  if (round.phase === 'prepare') {
    if (now < round.startsAt) return false;
    round.phase = 'select';
    round.version++;
  }
  if (round.phase === 'select') {
    const timedOut = round.endsAt !== null && now >= round.endsAt;
    if (!allReady() && !timedOut) return false;
    round.phase = 'closing';
    round.closesAt = (timedOut ? round.endsAt : now) + round.settings.graceMs;
    round.version++;
  }
  return now >= round.closesAt;
}
