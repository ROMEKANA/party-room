import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,mkdirSync} from 'node:fs';
import {api} from '../server/api.js';
import {staticResponse} from '../server/assets.js';

mkdirSync('.dev',{recursive:true});
const sqlite = new DatabaseSync(process.env.TIER_TEST_DB ?? '.dev/room.sqlite');
sqlite.exec('PRAGMA journal_mode=WAL');
// Older development databases have the room table but no migration journal.
sqlite.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
if (sqlite.prepare("SELECT name FROM sqlite_master WHERE name='room'").get()) {
  sqlite.prepare('INSERT OR IGNORE INTO local_migrations VALUES (?)').run('0000_room.sql');
}
for (const file of readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) {
  if (sqlite.prepare('SELECT 1 FROM local_migrations WHERE name = ?').get(file)) continue;
  sqlite.exec('BEGIN');
  try {
    sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
    sqlite.prepare('INSERT INTO local_migrations VALUES (?)').run(file);
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}
const db = {
  async batch(queries) {
    sqlite.exec('BEGIN');
    try {
      const results = queries.map(query => query.execute());
      sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  },
  prepare(sql) {
    const statement = sqlite.prepare(sql);
    const query = args => {
      const execute = () => ({meta:statement.run(...args)});
      return {
        execute,
        async first() {return statement.get(...args) ?? null;},
        async all() {return {results:statement.all(...args)};},
        async run() {return execute();},
      };
    };
    return {...query([]),bind:(...args)=>query(args)};
  },
};
const assets = Object.fromEntries(readdirSync('web').map(name => [
  name, () => readFileSync(new URL('../web/'+name,import.meta.url),'utf8'),
]));
const port = Number(process.env.PORT ?? process.argv[process.argv.indexOf('--port')+1]) || 4173;
const server = createServer(async (incoming,outgoing) => {
  try {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const request = new Request('http://localhost'+incoming.url,{
      method:incoming.method,headers:incoming.headers,
      ...(incoming.method === 'POST' ? {body:Buffer.concat(chunks)} : {}),
    });
    const response = incoming.url.startsWith('/api/') ? await api(request,db) : staticResponse(request,assets);
    outgoing.writeHead(response.status,Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    outgoing.writeHead(500).end();
  }
});
server.listen(port,'0.0.0.0',()=>console.log(`Tier Studio http://localhost:${port}`));
