import {TURN_GRACE_DEFAULTS} from '../web/time-settings.js';
import {requireGame} from './room.js';

export function turnGrace({readyMs,graceMs} = TURN_GRACE_DEFAULTS) {
  return {readyMs,graceMs};
}

export function beginTimedTurn(round, now) {
  round.turn++;
  round.phase = 'prepare';
  round.startsAt = now + round.timing.readyMs;
  round.endsAt = round.settings.seconds === null ? null : round.startsAt + round.settings.seconds * 1000;
  round.closesAt = null;
  round.moves = {};
  round.locked = false;
  round.version++;
}

export function advanceTimedSelection(round, now, allReady, lockOnReady = false) {
  if (round.phase === 'prepare') {
    if (now < round.startsAt) return false;
    round.phase = 'select';
    round.version++;
  }
  if (round.phase === 'select') {
    const timedOut = round.endsAt !== null && now >= round.endsAt;
    const ready = allReady();
    if (!ready && !timedOut) return false;
    round.phase = 'closing';
    round.closesAt = (timedOut ? round.endsAt : now) + round.timing.graceMs;
    round.locked = lockOnReady && ready;
    round.version++;
  } else if (lockOnReady && !round.locked && allReady()) {
    round.locked = true;
  }
  return now >= round.closesAt;
}

export function acceptsTimedMove(round, turn, now) {
  return turn === round.turn && (
    (round.phase === 'select' && now >= round.startsAt && (round.endsAt === null || now < round.endsAt)) ||
    (round.phase === 'closing' && !round.locked && now < round.closesAt)
  );
}

export function recordTimedMove(round, id, sequence, getMove, sequenceLabel = '選択順序') {
  requireGame(Number.isSafeInteger(sequence) && sequence > 0,sequenceLabel+'が無効です。',400);
  if (Object.hasOwn(round.moves,id) && round.moves[id].sequence >= sequence) return false;
  Object.defineProperty(round.moves,id,{
    value:{...getMove(),sequence},enumerable:true,configurable:true,
  });
  round.version++;
  return true;
}

export const allTimedPlayersReady = (round, departed, ids = round.ids) => ids.every(id=>
  Object.hasOwn(round.moves,id) || (round.endsAt === null && departed?.has(id)));
