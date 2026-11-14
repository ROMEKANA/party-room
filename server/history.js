import {orderedCards} from './round.js';

const HISTORY_MS = 30 * 60 * 1000;

export function snapshot(s, now) {
  const r = s.round;
  const scores = r.scores;
  const players = r.ids.map(id => {
    const player = s.players.find(p => p.id === id);
    return {id,color:player.color,...(scores ? {score:scores[id]} : {})};
  });
  const summary = {
    id:r.id, endedAt:now, expiresAt:now + HISTORY_MS, topic:r.topic, mode:r.mode,
    difficulty:r.settings.difficulty, count:r.ids.length, cardsPerPlayer:r.settings.cardsPerPlayer,
    total:r.cards.length, parent:r.parent,
  };
  const cards = orderedCards(r).map(({id,word,owner,placed,answer}) => ({id,word,owner,placed,answer}));
  const result = {
    win:r.result.win, lives:r.lives, initialLives:r.mode === 1 ? r.settings.mode1Lives : r.mode === 3 ? 1 : null,
    fixed:r.cards.filter(c => c.fixed).length, submitted:r.cards.filter(c => c.word).length,
    misses:r.misses, attempts:r.attempts,
    ...(r.mode === 2 ? {correctCount:r.feedback.score,
      target:r.settings.mode2Rule === 'accuracy' ? r.settings.mode2Target : null} : {}),
  };
  return {summary,detail:{...summary,players,tiers:r.tiers,cards,result}};
}

export function deleteExpired(db, now) {
  return db.prepare('DELETE FROM round_history WHERE ended_at <= ?').bind(now - HISTORY_MS);
}

export async function readHistory(db, now, id) {
  await deleteExpired(db,now).run();
  if (id !== null) {
    const row = await db.prepare('SELECT snapshot FROM round_history WHERE id = ? AND ended_at > ?')
      .bind(id,now - HISTORY_MS).first();
    return row ? JSON.parse(row.snapshot) : null;
  }
  const {results} = await db.prepare('SELECT summary FROM round_history WHERE ended_at > ? ORDER BY ended_at DESC, id DESC')
    .bind(now - HISTORY_MS).all();
  return results.map(row => JSON.parse(row.summary));
}
