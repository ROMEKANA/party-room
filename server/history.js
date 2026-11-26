import {consensusCards} from './consensus.js';
import {MODES} from '../web/config.js';
import {lifeStatus, orderedCards} from './round.js';

import {CIRCLE,TIER} from '../web/games.js';
import {view as circleView} from './circle.js';

const scope = "COALESCE(json_extract(summary, '$.gameId'), 'tier')";
const historyMs = minutes => minutes * 60 * 1000;

export function resetHistory(db,revision,game) {
  const guard = 'EXISTS (SELECT 1 FROM room WHERE id = 1 AND revision = ?)';
  return game ? db.prepare('DELETE FROM round_history WHERE '+guard+' AND '+scope+' = ?').bind(revision,game) :
    db.prepare('DELETE FROM round_history WHERE '+guard).bind(revision);
}

export function snapshot(s, now) {
  const r = s.round;
  const header = {id:r.id, gameId:s.game, endedAt:now, count:r.ids.length};
  if (s.game === CIRCLE) {
    const board = circleView(r,null);
    const winner = board.players[board.winner].name;
    const summary = {...header, winner, rounds:board.round};
    return {summary,detail:{...summary,board}};
  }
  const scores = r.scores;
  const players = r.ids.map(id => {
    const player = s.players.find(p => p.id === id);
    return {id,color:player.color,...(scores ? {score:scores[id]} : {})};
  });
  const summary = {
    ...header, topic:r.topic, mode:r.mode, win:r.result.win,
    difficulty:r.settings.difficulty, cardsPerPlayer:r.settings.cardsPerPlayer,
    total:r.cards.length, parent:r.parent,
  };
  if (r.mode === 4) {
    const cards = consensusCards(r).map(({id,word,owner,answer}) => ({id,word,owner,answer}));
    return {summary,detail:{...summary,modeName:MODES[r.mode],settings:r.settings,players,tiers:r.tiers,cards,result:r.result}};
  }
  const cards = orderedCards(r).map(({id,word,owner,placed,answer}) => ({id,word,owner,placed,answer}));
  const result = {
    win:r.result.win, ...lifeStatus(r),
    fixed:r.cards.filter(c => c.fixed).length, submitted:r.cards.filter(c => c.word).length,
    misses:r.misses, attempts:r.attempts,
    ...(r.mode === 2 ? {correctCount:r.feedback.score,
      target:r.settings.mode2Rule === 'accuracy' ? r.settings.mode2Target : null} : {}),
  };
  return {summary,detail:{...summary,players,tiers:r.tiers,cards,result}};
}

export function deleteExpired(db, now, minutes, revision = null) {
  const cutoff = now - historyMs(minutes);
  return revision === null
    ? db.prepare('DELETE FROM round_history WHERE ended_at <= ?').bind(cutoff)
    : db.prepare('DELETE FROM round_history WHERE ended_at <= ? AND EXISTS (SELECT 1 FROM room WHERE id = 1 AND revision = ?)').bind(cutoff,revision);
}

export async function readHistory(db, now, id, minutes, game, revision) {
  await deleteExpired(db,now,minutes,revision).run();
  const age = now - historyMs(minutes);
  const filter = game ? ' AND '+scope+' = ?' : '';
  const values = game ? [game] : [];
  const record = json => {
    const item = JSON.parse(json);
    return {...item,gameId:item.gameId ?? TIER,expiresAt:item.endedAt + historyMs(minutes)};
  };
  if (id !== null) {
    const row = await db.prepare('SELECT snapshot FROM round_history WHERE id = ? AND ended_at > ?'+filter)
      .bind(id,age,...values).first();
    return row ? record(row.snapshot) : null;
  }
  const {results} = await db.prepare('SELECT summary FROM round_history WHERE ended_at > ?'+filter+' ORDER BY ended_at DESC, id DESC')
    .bind(age,...values).all();
  return results.map(row => record(row.summary));
}
