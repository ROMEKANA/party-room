import {GameError,initialRoom} from './room.js';

export async function update(db, change) {
  const session = typeof db.withSession === 'function' ? db.withSession('first-primary') : db;
  for (let attempt = 0; attempt < 20; attempt++) {
    const row = await session.prepare('SELECT revision, state FROM room WHERE id = 1').first();
    const revision = row?.revision ?? 0;
    const state = row ? JSON.parse(row.state) : initialRoom();
    const result = change(state);
    const serialized = JSON.stringify(state);
    if (row?.state === serialized || (!row && serialized === JSON.stringify(initialRoom()))) {
      return {state,result,revision};
    }
    const statement = row
      ? session.prepare('UPDATE room SET state = ?, revision = ? WHERE id = 1 AND revision = ?')
          .bind(serialized,revision+1,revision)
      : session.prepare('INSERT OR IGNORE INTO room (id, revision, state) VALUES (1, 1, ?)').bind(serialized);
    if ((await statement.run()).meta.changes === 1) return {state,result,revision:revision+1};
  }
  throw new GameError('操作が集中しています。もう一度お試しください。',503,'busy');
}
