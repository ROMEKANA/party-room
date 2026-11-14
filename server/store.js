import {GameError,initialRoom} from './room.js';
import {deleteExpired,snapshot} from './history.js';

export async function update(db, change, now) {
  const session = typeof db.withSession === 'function' ? db.withSession('first-primary') : db;
  for (let attempt = 0; attempt < 20; attempt++) {
    const row = await session.prepare('SELECT revision, state FROM room WHERE id = 1').first();
    const revision = row?.revision ?? 0;
    const state = row ? JSON.parse(row.state) : initialRoom();
    const previousRound = state.round;
    const previousPhase = previousRound?.phase;
    const result = change(state);
    const finished = state.round && state.round === previousRound &&
      previousPhase !== 'result' && state.round.phase === 'result';
    if (finished) state.historyVersion = state.round.id;
    const serialized = JSON.stringify(state);
    if (row?.state === serialized || (!row && serialized === JSON.stringify(initialRoom()))) {
      return {state,result,revision};
    }
    const statement = row
      ? session.prepare('UPDATE room SET state = ?, revision = ? WHERE id = 1 AND revision = ?')
          .bind(serialized,revision+1,revision)
      : session.prepare('INSERT OR IGNORE INTO room (id, revision, state) VALUES (1, 1, ?)').bind(serialized);
    let written;
    if (finished || result?.resetHistory) {
      const guard = 'EXISTS (SELECT 1 FROM room WHERE id = 1 AND revision = ?)';
      let historyWrite;
      if (finished) {
        const record = snapshot(state,now);
        historyWrite = session.prepare(
          'INSERT INTO round_history (id, ended_at, summary, snapshot) SELECT ?, ?, ?, ? WHERE '+guard)
          .bind(record.summary.id,now,JSON.stringify(record.summary),JSON.stringify(record.detail),revision);
      } else {
        historyWrite = session.prepare('DELETE FROM round_history WHERE '+guard).bind(revision);
      }
      const results = await session.batch([historyWrite,deleteExpired(session,now),statement]);
      written = results[2];
    } else {
      written = await statement.run();
    }
    if (written.meta.changes === 1) return {state,result,revision:revision+1};
  }
  throw new GameError('操作が集中しています。もう一度お試しください。',503,'busy');
}
