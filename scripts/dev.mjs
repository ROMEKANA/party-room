import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync} from 'node:fs';
import {api} from '../server/api.js';
import {staticResponse} from '../server/assets.js';

mkdirSync('.dev',{recursive:true});
const sqlite = new DatabaseSync(process.env.TIER_TEST_DB ?? '.dev/room.sqlite');
sqlite.exec('PRAGMA journal_mode=WAL');
if (!sqlite.prepare("SELECT name FROM sqlite_master WHERE name='room'").get()) {
  sqlite.exec(readFileSync('drizzle/0000_room.sql','utf8'));
}
const db = {prepare(sql) {
  const statement = sqlite.prepare(sql);
  const query = args => ({
    async first() {return statement.get(...args) ?? null;},
    async run() {return {meta:statement.run(...args)};},
  });
  return {...query([]),bind:(...args)=>query(args)};
}};
const assets = Object.fromEntries(['index.html','style.css','app.js','config.js','sync.js','board.js','dialogs.js'].map(name => [
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
