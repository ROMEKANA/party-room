import {requireGame} from './room.js';

export function beginTimedTurn(round, now, readyMs = round.settings.readyMs) {
  round.turn++;
  round.phase = 'prepare';
  round.startsAt = now + readyMs;
  round.endsAt = round.settings.seconds === null ? null : round.startsAt + round.settings.seconds * 1000;
  round.closesAt = null;
  round.moves = {};
  round.version++;
}

export function advanceTimedSelection(round, now, allReady, graceMs = round.settings.graceMs) {
  if (round.phase === 'prepare') {
    if (now < round.startsAt) return false;
    round.phase = 'select';
    round.version++;
  }
  if (round.phase === 'select') {
    const timedOut = round.endsAt !== null && now >= round.endsAt;
    if (!allReady() && !timedOut) return false;
    round.phase = 'closing';
    round.closesAt = (timedOut ? round.endsAt : now) + graceMs;
    round.version++;
  }
  return now >= round.closesAt;
}

export function recordTimedMove(round, id, sequence, getMove) {
  requireGame(Number.isSafeInteger(sequence) && sequence > 0,'選択順序が無効です。',400);
  if (Object.hasOwn(round.moves,id) && round.moves[id].sequence >= sequence) return false;
  Object.defineProperty(round.moves,id,{
    value:{...getMove(),sequence},enumerable:true,configurable:true,
  });
  round.version++;
  return true;
}
