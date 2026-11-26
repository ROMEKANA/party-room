import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../dist/server/index.js';
import {releaseEntries} from '../web/release-data.js';
import {VERSION} from '../web/version.js';
import {api} from '../server/api.js';
import {shuffle} from '../server/draw.js';

function harness() {
  const sqlite = new DatabaseSync(':memory:');
  const directory = new URL('../drizzle/',import.meta.url);
  for (const file of readdirSync(directory).filter(name => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL(file,directory),'utf8'));
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
  let now = 100;
  const req = async (route, payload, token, headers = {}) => {
    const request = new Request('https://tier.test/api/'+route,{
      method:payload?'POST':'GET',body:payload?JSON.stringify(payload):undefined,
      headers:{'X-App-Version':VERSION,...(token?{Authorization:'Bearer '+token}:{}),...headers},
    });
    const response = await api(request,db,now);
    return {...await response.json(),status:response.status};
  };
  async function join(name) {
    const result = await req('join',{name});
    if (!result.token) return result;
    const {token} = result;
    const get = ()=>req('state',null,token);
    const history = id=>req(id ? 'history/'+id : 'history',null,token);
    const send = async (type,fields={},base) => {
      const s = (await get()).state;
      const r = base === undefined ? s?.round : base;
      return req('action',{id:crypto.randomUUID(),game:s?.game,scope:s?.scope,round:r?.id??null,version:r?.version??0,type,...(r?.draftRevision != null ? {draftRevision:r.draftRevision} : {}),...fields},token);
    };
    return {name,token,get,history,send,state:async()=>(await get()).state};
  }
  const raw = () => JSON.parse(sqlite.prepare('SELECT state FROM room').get().state);
  return {join,raw,req,sqlite,advance:ms=>{now+=ms;},db};
}

test('Worker artifact serves UI, stores game in database binding and isolates public asset paths',async()=>{
  const h=harness();
  const base='https://tier.test';
  assert.match(await (await worker.fetch(new Request(base),{DB:h.db})).text(),/いつでもパーティールーム/);
  assert.equal((await worker.fetch(new Request(base+'/server/room.js'),{DB:h.db})).status,404);
  const r=await worker.fetch(new Request(base+'/api/join',{method:'POST',body:'{"name":"Worker"}'}),{DB:h.db});
  assert.equal(r.status,200);
  assert.equal(h.raw().host,'Worker');
});

test('capacity, same-name takeover, persistence, host grace, manual transfer and kick',async()=>{
  const h=harness();
  const ps=await Promise.all(Array.from({length:10},(_,i)=>h.join('p'+i)));
  assert.ok(ps.every(p=>p.token));
  const order=h.raw().players.map(p=>p.id);
  const current=ps.find(p=>p.name===order[0]);
  assert.equal((await h.join('overflow')).code,'full');
  const newHost=await h.join(' '+current.name+' ');
  assert.equal((await current.get()).status,401);
  assert.equal((await newHost.state()).host,current.name);
  const successor=ps.find(p=>p.name===order[1]);
  h.advance(12_000);
  await successor.get();
  h.advance(12_000);
  assert.equal((await successor.state()).host,current.name);
  h.advance(22_000);
  assert.equal((await successor.state()).host,successor.name);
  const other=await h.join('other');
  assert.equal((await successor.send('transfer',{player:other.name})).status,200);
  assert.equal((await other.send('kick',{player:successor.name})).status,200);
  assert.equal((await successor.get()).status,401);
  const returned=await h.join(successor.name);
  assert.ok(returned.token);
  await other.send('leave');
  assert.equal((await returned.state()).host,returned.name);
});

async function round(mode,extra={}) {
  const h=harness();
  const host=await h.join('host'), b=await h.join('b'), c=await h.join('c');
  const players={host,b,c};
  await host.send('choose',{choice:'tier'});
  const set=await host.send('settings',{settings:{mode,difficulty:'easy',cardsPerPlayer:2,...extra}});
  assert.equal(set.status,200);
  assert.equal((await b.send('settings',{settings:{mode:1}})).status,409);
  assert.equal((await host.send('start')).status,200);
  const r=(await host.state()).round;
  return {h,host,b,c,players,parent:players[r.parent],setter:players[r.setter],topic:'公開制御の確認用お題'};
}
test('mode 2 perfect and accuracy through independent HTTP sessions',async()=>{
  for (const mode2Rule of ['perfect','accuracy']) {
    const {h,host,players,parent,setter,topic}=await round(2,{mode2Rule,mode2Attempts:2,mode2Target:100});
    const initial = 2;
    const start = (await parent.state()).round;
    assert.deepEqual([start.lives,start.initialLives],[initial,initial]);
    await setter.send('topic',{word:topic});
    let seq=0;
    for (const child of Object.values(players).filter(p=>p!==parent)) {
      for (let i=0;i<2;i++) {
        const {input}= (await child.state()).round;
        assert.ok(input.tier);
        assert.equal((await child.send('word',{card:input.id,word:'card'+seq++})).status,200);
        if (seq<4) assert.deepEqual((await parent.state()).round.cards,[]);
      }
    }
    assert.equal((await parent.send('submit')).status,409);
    const child=Object.values(players).find(p=>p!==parent);
    let r=(await parent.state()).round;
    const first=r.current.id;
    assert.equal((await child.send('place',{card:first,tier:'A'})).status,409);
    await parent.send('place',{card:first,tier:'A'});
    r=(await child.state()).round;
    const deferred=r.current.id;
    assert.equal(r.cards.find(c=>c.id===first).placed,'A');
    assert.ok(r.cards.every(c=>!Object.hasOwn(c,'answer')));
    await parent.send('select',{card:first});
    assert.equal((await parent.state()).round.current.id,first);
    const replaced=await h.join(parent.name);
    assert.equal((await parent.get()).status,401);
    assert.equal((await replaced.state()).round.current.id,first);
    assert.equal(h.raw().round.queue.at(-1),deferred);
    const cards = h.raw().round.cards;
    const repeated = cards.find(card=>cards.filter(other=>other.answer===card.answer).length>1);
    for (const id of [...h.raw().round.queue]) {
      const answer=cards.find(c=>c.id===id).answer;
      const tier=id===repeated.id ? ['A','B','C'].find(t=>t!==answer) : answer;
      await replaced.send('place',{card:id,tier});
    }
    const firstSubmission = (await replaced.state()).round;
    const submissions = await Promise.all([replaced.send('submit',{},firstSubmission),
      replaced.send('submit',{},firstSubmission)]);
    assert.deepEqual(submissions.map(response=>response.status).sort(),[200,409]);
    let activeHost=parent===host?replaced:host;
    r=(await child.state()).round;
    assert.equal(r.phase,'attemptResult');
    assert.equal(r.feedback.score,3);
    assert.equal(r.attempts,1);
    assert.deepEqual([r.lives,r.initialLives],[1,2]);
    assert.deepEqual((await activeHost.history()).record,[]);
    assert.ok(r.cards.every(c=>!Object.hasOwn(c,'answer')));
    if (mode2Rule==='accuracy') {
      assert.equal(r.target,100);
      assert.deepEqual(r.cards.filter(c=>c.correct===false).map(c=>c.id),[repeated.id]);
    }
    const resumed = await h.join(replaced.name);
    assert.equal((await replaced.get()).status,401);
    assert.deepEqual((await resumed.state()).round.feedback,r.feedback);
    if (activeHost===replaced) activeHost = resumed;
    await activeHost.send('next');
    for (const card of h.raw().round.cards) {
      await resumed.send('select',{card:card.id});
      await resumed.send('place',{card:card.id,tier:card.answer});
    }
    await resumed.send('submit');
    if (mode2Rule==='perfect') await activeHost.send('next');
    r=(await resumed.state()).round;
    assert.equal(r.phase,'result');
    assert.equal(r.result.win,true);
    assert.ok(r.cards.every(c=>c.answer===c.placed));
    assert.deepEqual([r.lives,r.initialLives],[1,initial]);
    const saved = (await activeHost.history(r.id)).record.result;
    assert.deepEqual([saved.lives,saved.initialLives],[1,initial]);
    assert.equal((await activeHost.send('lobby')).status,200);
  }
});
test('mode 2 defaults to accuracy and stops after all configured attempts fail',async()=>{
  const {h,host,parent,players,setter,topic} = await round(2,{mode2Attempts:2});
  assert.equal((await host.state()).settings.mode2Rule,'accuracy');
  await setter.send('topic',{word:topic});
  for (const player of Object.values(players).filter(p=>p!==parent)) {
    for (let i=0;i<2;i++) {
      const {input} = (await player.state()).round;
      await player.send('word',{card:input.id,word:player.name+i});
    }
  }
  const tiers = ['A','B','C'];
  for (const id of h.raw().round.queue) {
    const {answer} = h.raw().round.cards.find(card=>card.id===id);
    await parent.send('place',{card:id,tier:tiers[(tiers.indexOf(answer)+1)%tiers.length]});
  }
  assert.equal((await parent.send('submit')).status,200);
  assert.deepEqual((await host.history()).record,[]);
  await host.send('next');
  assert.equal((await parent.send('submit')).status,200);
  const final = (await host.state()).round;
  assert.deepEqual([final.phase,final.result.win,final.attempts,final.lives,final.target],['result',false,2,0,70]);
  const record = (await host.history(final.id)).record;
  assert.deepEqual([record.result.attempts,record.result.correctCount,record.result.lives],[2,0,0]);
});

test('mode 1 only asks the writer to confirm their turn and accepts one concurrent proposal',async()=>{
  for (const mode1ConfirmTurn of [false,true]) {
    const {host,players,setter,topic} = await round(1,{mode1ConfirmTurn});
    assert.equal((await host.state()).settings.mode1ConfirmTurn,mode1ConfirmTurn);
    await setter.send('topic',{word:topic});
    const writer = players[(await host.state()).round.turn];
    const others = Object.values(players).filter(player=>player!==writer);
    const {input,confirmTurn} = (await writer.state()).round;
    assert.equal(confirmTurn,mode1ConfirmTurn || undefined);
    for (const other of others) {
      const {round} = await other.state();
      assert.equal(round.input,null);
      assert.equal(round.confirmTurn,undefined);
    }
    await writer.send('word',{card:input.id,word:'提案のテスト'});
    const base = (await host.state()).round;
    const proposals = await Promise.all(others.map((player,i)=>
      player.send('propose',{card:input.id,tier:['A','B'][i]},base)));
    assert.deepEqual(proposals.map(result=>result.status).sort(),[200,409]);
    const roundAfter = (await host.state()).round;
    assert.equal(roundAfter.phase,'vote');
    assert.equal(roundAfter.version,base.version+1);
    assert.equal(roundAfter.proposal.tier,proposals.find(result=>result.status===200).state.round.proposal.tier);
  }
});

test('mode 3 hides topics and authors until results, with incremental placement and fallback judge',async()=>{
  const {h,host,players,parent,setter,topic}=await round(3);
  const watcher=await h.join('spectator');
  assert.equal((await watcher.state()).players.find(p=>p.id===watcher.name).spectator,true);
  assert.equal(Object.hasOwn((await parent.state()).round,'candidate'),false);
  await setter.send('topic',{word:topic});
  for (const p of [parent,watcher]) {
    assert.equal(JSON.stringify(await p.state()).includes(topic),false);
  }
  let count=0;
  for (const child of Object.values(players).filter(p=>p!==parent)) {
    for (let i=0;i<2;i++) {
      const {input}=(await child.state()).round;
      assert.equal((await child.send('word',{card:input.id,word:'clue'+(++count)})).status,200);
      const r=(await parent.state()).round;
      assert.equal(r.cards.length,count);
      assert.equal(r.cards.find(c=>c.id===input.id).placed,input.tier);
      assert.ok(r.cards.every(c=>!Object.hasOwn(c,'owner')));
      const parentState=await parent.state();
      assert.ok(parentState.players.every(p=>p.mark===null));
      for (const tier of parentState.tiers) {
        const words = r.cards.filter(c=>c.placed===tier).map(c=>c.word);
        assert.deepEqual(words,[...words].sort());
      }
      const authored=(await child.state()).round.cards.find(c=>c.id===input.id);
      assert.equal(authored.owner,child.name);
      assert.equal(r.topic,null);
    }
  }
  assert.equal((await parent.send('judge',{win:true})).status,409);
  await setter.send('leave');
  const fallback=Object.values(players).find(p=>p!==parent&&p!==setter);
  assert.equal((await fallback.state()).round.canJudge,true);
  await fallback.send('judge',{win:true});
  assert.equal((await parent.state()).round.topic,topic);
  const final=await parent.state();
  assert.deepEqual(
    final.round.cards.map(c=>c.owner).sort(),
    h.raw().round.cards.map(c=>c.owner).sort(),
  );
  const nonHost=final.host===parent.name?fallback:parent;
  assert.equal((await nonHost.send('lobby')).status,409);
  assert.equal((await players[final.host].send('lobby')).status,200);
});

test('only one competing proposal is committed and stale vote cannot cross candidates',async()=>{
  const {host,players,setter}=await round(1);
  await setter.send('topic',{word:'テスト'});
  let r=(await host.state()).round;
  const writer=players[r.turn];
  const voters=Object.values(players).filter(p=>p!==writer);
  const {input}=(await writer.state()).round;
  await writer.send('word',{card:input.id,word:'テスト'});
  r=(await host.state()).round;
  const outcomes=await Promise.all(voters.map((v,i)=>v.send('propose',{card:input.id,tier:r.tiers?.[i]??['A','B'][i]},r)));
  assert.deepEqual(outcomes.map(v=>v.status).sort(),[200,409]);
  const old=(await host.state()).round;
  await voters[0].send('vote',{proposal:old.proposal.id,choice:'bad'});
  await voters[0].send('propose',{card:input.id,tier:'C'});
  assert.equal((await voters[0].send('vote',{proposal:old.proposal.id,choice:'good'},old)).status,409);
  assert.equal((await host.state()).round.lives,3);
});

test('ten players complete a hard 100-card mode 1 round and every card appears once',async()=>{
  const h=harness();
  const group=await Promise.all(Array.from({length:10},(_,i)=>h.join('seat'+i)));
  const host=group.find(p=>p.name===h.raw().host);
  await host.send('choose',{choice:'tier'});
  await host.send('settings',{settings:{difficulty:'hard',cardsPerPlayer:10,mode1Lives:30}});
  await host.send('start');
  const who=id=>group.find(p=>p.name===id);
  await who(h.raw().round.setter).send('topic');
  for (let i=0;i<100;i++) {
    const {round}=h.raw();
    const card=round.cards[i], writer=who(card.owner);
    const view=(await writer.state()).round;
    const voters=group.filter(p=>p!==writer);
    assert.equal((await writer.send('word',{card:view.input.id,word:'カード '+i})).status,200);
    assert.equal((await voters[0].send('propose',{card:card.id,tier:card.answer})).status,200);
    const r=(await voters[0].state()).round;
    const votes=await Promise.all(voters.map(p=>p.send('vote',{proposal:r.proposal.id,choice:'good'},r)));
    assert.ok(votes.every(v=>v.status===200));
    assert.equal((await host.send('next')).status,200);
  }
  const r=(await host.state()).round;
  assert.equal(r.phase,'result');
  assert.equal(r.fixed,100);
  assert.equal(new Set(r.cards.map(c=>c.id)).size,100);
  assert.equal(new Set(r.cards.map(c=>c.placed)).size,7);
});

test('topic chooser supports reroll and custom input, and hides candidate and topic from a nominated parent', async()=>{
  const {host,b,c,parent,setter}=await round(3,{nominatedParent:'b',nominatedSetter:'c'});
  assert.equal(parent,b);
  assert.equal(setter,c);
  const before=(await c.state()).round;
  assert.ok(before.candidate);
  assert.equal(Object.hasOwn((await b.state()).round,'candidate'),false);
  assert.equal((await host.send('reroll')).status,409);
  assert.equal((await c.send('reroll')).status,200);
  const changed=(await c.state()).round;
  assert.notEqual(changed.candidate,before.candidate);
  assert.equal((await c.send('topic',{source:'random'},before)).status,409);
  assert.equal((await c.send('topic',{source:'custom',word:'  '})).status,400);
  const topic='自由に選ぶお題';
  assert.equal((await c.send('topic',{source:'custom',word:topic})).status,200);
  assert.equal((await c.state()).round.topic,topic);
  assert.equal((await b.state()).round.topic,null);
  assert.equal((await host.state()).settings.nominatedSetter,null);
});

test('mode 1 nomination is one-time and skips no one in random rotation',async()=>{
  const h=harness();
  const [host,b,c]=await Promise.all(['h','b','c'].map(name=>h.join(name)));
  const owner=[host,b,c].find(p=>p.name===h.raw().host);
  const player=owner===b?c:b;
  await owner.send('choose',{choice:'tier'});
  assert.equal((await owner.send('settings',{settings:{nominatedMode1Setter:player.name}})).status,200);
  await owner.send('start');
  assert.equal(h.raw().round.setter,player.name);
  assert.equal(h.raw().rotation.setter,null);
  await owner.send('end');
  const cycle=[];
  for (let i=0;i<3;i++) {
    await owner.send('start');
    cycle.push(h.raw().round.setter);
    await owner.send('end');
  }
  assert.equal(new Set(cycle).size,3);
});

test('fixed-index shuffle keeps its input intact and retains deterministic draw calls',()=>{
  const values = ['A','B','C','D','E'];
  const random = ()=>0;
  assert.deepEqual(shuffle(values,random),['B','C','D','E','A']);
  assert.deepEqual(shuffle(values,random,0,2),['A','D','C','E','B']);
  assert.deepEqual(shuffle(values,random,0,0,1,2,3,4),values);
  assert.notEqual(shuffle(values,0),values);
  assert.equal(shuffle(values,0)[0],'A');
  assert.deepEqual(shuffle([],0,2),[]);
  assert.deepEqual(values,['A','B','C','D','E']);
});

test('the host sets the topic setter first and synchronizes parent and player order in both guessing modes',async()=>{
  const h=harness();
  const [a,b,c,d,e] = await Promise.all(['A','B','C','D','E'].map(name=>h.join(name)));
  await a.send('choose',{choice:'tier'});
  const set = settings => a.send('settings',{settings});
  const order = state => state.players.map(p=>p.id);
  assert.equal((await set({mode:2,nominatedParent:'B'})).status,409);
  assert.equal((await set({mode:2,nominatedSetter:'E',nominatedParent:'E'})).status,409);
  const wrapped = (await set({mode:2,nominatedSetter:'E'})).state;
  assert.equal(wrapped.settings.nominatedParent,'A');
  assert.deepEqual(order(wrapped),['A','B','C','D','E']);
  const defaultParent = (await set({nominatedSetter:'C'})).state;
  assert.equal(defaultParent.settings.nominatedParent,'D');
  assert.deepEqual(order((await set({nominatedParent:'D'})).state),order(defaultParent));
  const reordered = (await set({nominatedParent:'E'})).state;
  assert.deepEqual(order(reordered),['C','E','A','B','D']);
  assert.deepEqual(order(await b.state()),order(reordered));
  assert.equal((await e.state()).host,'A');
  assert.equal((await d.send('shuffle')).status,409);

  const shuffled = (await a.send('shuffle')).state;
  assert.deepEqual(order(shuffled).slice(0,2),['C','E']);
  assert.deepEqual(order(shuffled).slice(2).sort(),['A','B','D']);
  assert.equal(shuffled.settings.nominatedParent,'E');
  const replacement = await h.join(c.name);
  assert.equal((await c.get()).status,401);
  assert.deepEqual(order(await replacement.state()),order(shuffled));

  const mode3 = (await set({mode:3,nominatedSetter:'E'})).state;
  assert.equal(mode3.settings.nominatedParent,order(shuffled)[2]);
  assert.equal((await set({nominatedSetter:null})).state.settings.nominatedParent,null);
  assert.equal((await set({mode:2})).state.settings.nominatedParent,'E');
  await a.send('start');
  const first = h.raw().round;
  assert.deepEqual(first.ids,order(shuffled));
  for (const client of [a,b,replacement,d,e]) {
    const state = await client.state();
    assert.deepEqual(order(state),first.ids);
    assert.deepEqual([state.round.setter,state.round.parent],['C','E']);
  }
  await a.send('end');
  await a.send('start');
  const next = h.raw().round;
  assert.deepEqual([next.setter,next.parent],['E',first.ids[2]]);
});

test('departures and legacy settings repair a nomination without changing the current round',async()=>{
  const h=harness();
  const a=await h.join('A'), b=await h.join('B'), c=await h.join('C'), d=await h.join('D');
  await a.send('choose',{choice:'tier'});
  const set = settings => a.send('settings',{settings});
  await set({mode:3,difficulty:'easy',nominatedSetter:'D'});
  await b.send('leave');
  assert.equal((await a.state()).settings.nominatedParent,'A');
  await set({nominatedParent:'C'});
  await c.send('leave');
  const state = await a.state();
  assert.deepEqual([state.settings.nominatedSetter,state.settings.nominatedParent],['D','A']);
  await a.send('start');
  assert.deepEqual([h.raw().round.setter,h.raw().round.parent],['D','A']);
  await a.send('end');
  await set({nominatedSetter:'D'});
  await d.send('leave');
  assert.equal((await a.state()).settings.nominatedSetter,null);
  assert.equal((await a.send('start')).status,409);

  const again = await h.join('B');
  const raw = h.raw();
  Object.assign(raw.settings,{nominatedParent:'B',nominatedSetter:'departed'});
  raw.nominees = {2:{setter:'B',parent:'departed'}};
  h.sqlite.prepare('UPDATE room SET state=?').run(JSON.stringify(raw));
  assert.equal((await again.state()).settings.nominatedParent,null);
  const restored = (await set({mode:2})).state;
  assert.deepEqual([restored.settings.nominatedSetter,restored.settings.nominatedParent],['B','A']);
  assert.equal((await a.send('start')).status,200);
  assert.deepEqual([h.raw().round.setter,h.raw().round.parent],['B','A']);
});

test('random guessing roles follow icon order with ten players and across rounds',async()=>{
  const h=harness();
  const group=[];
  for (let i=0;i<10;i++) group.push(await h.join('p'+i));
  const [host] = group;
  await host.send('choose',{choice:'tier'});
  await host.send('settings',{settings:{mode:2}});
  await host.send('shuffle');
  let previousParent;
  for (let i=0;i<11;i++) {
    assert.equal((await host.send('start')).status,200);
    const r=h.raw().round;
    assert.equal(r.ids.length,10);
    assert.equal(r.parent,r.ids[(r.ids.indexOf(r.setter)+1)%r.ids.length]);
    if (previousParent) assert.equal(r.setter,previousParent);
    previousParent = r.parent;
    await host.send('end');
  }
});


test('mode 2 input preview shows guesses at assigned tiers only to children when enabled',async()=>{
  for (const enabled of [true,false]) {
    const {h,players,parent,setter,topic}=await round(2,enabled?{}:{peekBoardWhileTyping:false});
    const children=Object.values(players).filter(p=>p!==parent);
    const watcher=await h.join('spectator');
    await setter.send('topic',{word:topic});
    const submitted=(await children[0].state()).round.input;
    const waiting=(await children[1].state()).round.input;
    assert.equal((await children[0].send('word',{card:submitted.id,word:'入力済みのカード'})).status,200);
    const view=await children[1].state();
    assert.equal(view.settings.peekBoardWhileTyping,enabled);
    assert.equal(view.round.input.id,waiting.id);
    assert.deepEqual(view.round.cards,enabled?[{
      id:submitted.id,word:'入力済みのカード',placed:submitted.tier,fixed:false,owner:children[0].name,
    }]:[]);
    for (const player of [parent,watcher]) assert.deepEqual((await player.state()).round.cards,[]);
    assert.equal(h.raw().round.cards.find(c=>c.id===submitted.id).placed,null);
  }
});

test('scoring is private until the final result, awards only the successful vote, and survives a life loss in history',async()=>{
  const {h,host,players,setter}=await round(1,{mode1Scoring:true,mode1Lives:2,mode1Wrong:'retry'});
  await setter.send('topic',{word:'得点確認'});
  async function write(word) {
    const card = h.raw().round.cards[h.raw().round.turn];
    await players[card.owner].send('word',{card:card.id,word});
    return card;
  }
  async function vote(card,tier,choice = 'good') {
    const voters = Object.values(players).filter(p=>p.name!==card.owner);
    assert.equal((await voters[0].send('propose',{card:card.id,tier})).status,200);
    const base = (await host.state()).round;
    const replies = await Promise.all(voters.slice(0,choice==='bad'?1:2)
      .map(p=>p.send('vote',{proposal:base.proposal.id,choice},base)));
    assert.ok(replies.every(r=>r.status===200));
  }
  const first = await write('最初');
  await vote(first,first.answer,'bad');
  assert.ok(Object.values(h.raw().round.scores).every(score=>score===0));
  await vote(first,['A','B','C'].find(tier=>tier!==first.answer));
  assert.ok(Object.values(h.raw().round.scores).every(score=>score===0));
  assert.equal((await host.state()).round.lives,1);
  await host.send('next');
  await vote(first,first.answer);
  assert.equal(Object.hasOwn((await host.state()).round,'scores'),false);
  assert.deepEqual((await host.history()).record,[]);
  await host.send('next');
  const second = await write('最後');
  await vote(second,['A','B','C'].find(tier=>tier!==second.answer));
  const final = (await host.state()).round;
  assert.equal(final.phase,'result');
  assert.equal(final.lives,0);
  assert.equal(final.initialLives,2);
  assert.equal(final.scores[first.owner],2);
  assert.equal(Object.values(final.scores).reduce((sum,score)=>sum+score,0),4);
  const watcher = await h.join('あとから');
  const list = (await watcher.history()).record;
  assert.equal(list.length,1);
  assert.equal(list[0].id,final.id);
  const saved = (await watcher.history(final.id)).record;
  assert.deepEqual(saved.players.map(p=>p.score).sort(),[1,1,2]);
  assert.equal(saved.result.misses,2);
  assert.equal(saved.result.fixed,1);
  assert.equal(saved.result.win,false);
  assert.equal(saved.cards.find(c=>c.word==='最後').owner,second.owner);
  assert.equal(Object.hasOwn(saved,'votes'),false);
  assert.ok(saved.cards.every(c=>!Object.hasOwn(c,'position')));
  assert.equal((await h.req('history',null)).status,401);
  assert.equal((await watcher.send('resetHistory')).status,403);
  assert.equal((await host.send('resetHistory')).status,200);
  assert.deepEqual((await watcher.history()).record,[]);
  assert.equal((await watcher.history(final.id)).status,404);
  assert.deepEqual((await host.state()).round.scores,final.scores);
});

test('history omits unfinished rounds, expires after 30 minutes, and is deleted upon access',async()=>{
  const {h,host,parent,players,setter}=await round(3);
  assert.equal((await parent.state()).round.initialLives,1);
  await setter.send('topic',{word:'消える履歴'});
  assert.equal((await host.send('commonSettings',{minutes:30})).status,200);
  for (const player of Object.values(players).filter(p=>p!==parent)) {
    for (let i=0;i<2;i++) {
      const {input} = (await player.state()).round;
      await player.send('word',{card:input.id,word:player.name+i});
    }
  }
  await setter.send('judge',{win:false});
  const {id} = (await host.state()).round;
  assert.equal((await host.history(id)).record.result.lives,0);
  assert.equal((await host.history(id)).record.result.initialLives,1);
  await host.send('start');
  await host.send('end');
  assert.deepEqual((await host.history()).record.map(record=>record.id),[id]);
  h.advance(30*60*1000-1);
  assert.equal((await host.history(id)).status,200);
  h.advance(1);
  await (await h.join('新しい参加者')).get();
  assert.equal(await h.db.prepare('SELECT * FROM round_history').first(),null);
  assert.equal((await host.history(id)).status,404);
});

test('mode 2 appends a repositioned card to the end of the target tier in play and history',async()=>{
  const {h,host,parent,players,setter}=await round(2,{mode2Rule:'accuracy',mode2Target:100,mode2Attempts:1});
  await setter.send('topic',{word:'配置順'});
  for (const player of Object.values(players).filter(p=>p!==parent)) {
    for (let i=0;i<2;i++) {
      const {input} = (await player.state()).round;
      await player.send('word',{card:input.id,word:player.name+i});
    }
  }
  const {queue,cards} = h.raw().round;
  const answers = queue.map(id=>cards.find(card=>card.id===id).answer);
  const tiers = answers.join('')==='AABC' ? ['A','A','C','B'] : ['A','A','B','C'];
  const order = [];
  for (let i=0;i<4;i++) {
    const {current} = (await parent.state()).round;
    order.push(current.id);
    await parent.send('place',{card:current.id,tier:tiers[i]});
  }
  assert.deepEqual((await host.state()).round.cards.map(c=>c.id),order);
  const [first,second,...rest] = order;
  await parent.send('select',{card:first});
  await parent.send('place',{card:first,tier:'A'});
  await parent.send('submit');
  const final = (await host.state()).round;
  assert.deepEqual(final.cards.map(c=>c.id),[second,first,...rest]);
  const saved = (await host.history(final.id)).record;
  assert.deepEqual(saved.cards.map(c=>c.id),[second,first,...rest]);
  assert.ok(saved.players.every(p=>!Object.hasOwn(p,'score')));
  assert.deepEqual([final.lives,final.initialLives],[0,1]);
  assert.deepEqual([saved.result.lives,saved.result.initialLives],[0,1]);
});

test('mode 2 perfect history saves the last submission even when a previous answer scored higher',async()=>{
  const {h,host,parent,players,setter}=await round(2,{mode2Rule:'perfect',mode2Attempts:3});
  await setter.send('topic',{word:'最後の回答'});
  for (const child of Object.values(players).filter(player=>player!==parent)) {
    for (let i=0;i<2;i++) {
      const {input} = (await child.state()).round;
      await child.send('word',{card:input.id,word:child.name+i});
    }
  }
  const cards = h.raw().round.cards;
  const tiers = ['A','B','C'];
  const boards = tiers.flatMap(a=>tiers.flatMap(b=>tiers.flatMap(c=>tiers.map(d=>[a,b,c,d]))))
    .filter(board=>new Set(board).size===tiers.length);
  for (let attempt=1;attempt<=3;attempt++) {
    const target = boards.find(board=>cards.filter((card,i)=>card.answer===board[i]).length===4-attempt);
    const byId = new Map(cards.map((card,i)=>[card.id,target[i]]));
    if (attempt===1) {
      for (const id of h.raw().round.queue) await parent.send('place',{card:id,tier:byId.get(id)});
    } else {
      for (const card of cards) {
        await parent.send('select',{card:card.id});
        await parent.send('place',{card:card.id,tier:byId.get(card.id)});
      }
    }
    assert.equal((await parent.send('submit')).status,200);
    const result = (await host.state()).round;
    assert.deepEqual([result.lives,result.initialLives,result.feedback.score],[3-attempt,3,4-attempt]);
    assert.deepEqual((await host.history()).record,[]);
    await host.send('next');
  }
  const final = (await host.state()).round;
  assert.equal(final.result.win,false);
  const saved = (await host.history(final.id)).record;
  assert.deepEqual([saved.result.lives,saved.result.initialLives,saved.result.correctCount],[0,3,1]);
  assert.deepEqual(saved.cards.map(c=>[c.id,c.placed]),final.cards.map(c=>[c.id,c.placed]));
});

test('parent author visibility is independent for the two guessing modes and defaults to hidden',async()=>{
  for (const mode of [2,3]) {
    for (const enabled of [false,true]) {
      const otherSetting = mode===2 ? 'mode3ShowAuthors' : 'mode2ShowAuthors';
      const setting = mode===2 ? 'mode2ShowAuthors' : 'mode3ShowAuthors';
      const {h,host,parent,players,setter,topic} = await round(mode,{
        mode2Rule:'accuracy', [otherSetting]:!enabled, ...(enabled ? {[setting]:true} : {}),
      });
      await setter.send('topic',{word:topic});
      const children = Object.values(players).filter(p=>p!==parent);
      for (const child of children) {
        for (let i=0;i<2;i++) {
          const {input} = (await child.state()).round;
          await child.send('word',{card:input.id,word:child.name+i});
          if (mode===3) assert.equal((await parent.state()).round.topic,null);
        }
      }
      let view = await parent.state();
      assert.equal(view.settings[setting],enabled);
      if (mode===2) {
        assert.ok(view.round.current);
        assert.equal(Object.hasOwn(view.round.current,'owner'),enabled);
        for (const id of h.raw().round.queue) {
          const card = h.raw().round.cards.find(c=>c.id===id);
          await parent.send('place',{card:id,tier:card.answer});
        }
      }
      view = await parent.state();
      assert.equal(view.round.cards.length,4);
      assert.ok(view.round.cards.every(card=>Object.hasOwn(card,'owner')===enabled));
      assert.ok((await children[0].state()).round.cards.every(card=>Object.hasOwn(card,'owner')));
      if (mode===2) await parent.send('submit');
      else await setter.send('judge',{win:true});
      const result = (await parent.state()).round;
      assert.equal(result.phase,'result');
      const history = (await host.history(result.id)).record;
      assert.deepEqual(history.cards.map(card=>card.owner),result.cards.map(card=>card.owner));
      assert.ok(result.cards.every(card=>children.some(child=>child.name===card.owner)));
    }
  }
});

test('concurrent normalized names are unique within a round and reusable in a later match',async()=>{
  for (const mode of [2,3,4]) {
    const {h,host,setter,players,parent} = await round(mode);
    await setter.send('topic',{word:'重複テスト'});
    const [first,second] = Object.values(players).filter(p=>p!==parent);
    const [a,b] = await Promise.all([first.state(),second.state()]);
    const responses = await Promise.all([
      first.send('word',{card:a.round.input.id,word:'  ＡＢＣ  '},a.round),
      second.send('word',{card:b.round.input.id,word:'ABC'},b.round),
    ]);
    assert.equal(responses.filter(response=>response.status===200).length,1);
    assert.equal(responses.find(response=>response.status!==200).code,'duplicateCard');
    const winner = responses[0].status===200 ? first : second;
    const loser = winner===first ? second : first;
    const {input} = (await winner.state()).round;
    assert.equal((await winner.send('word',{card:input.id,word:'ABC'})).code,'duplicateCard');
    if (mode===4) {
      const [saved] = (await winner.state()).round.ownCards;
      assert.equal((await loser.send('editWord',{card:saved.id,word:'改名'})).status,409);
      assert.equal((await winner.send('editWord',{card:saved.id,word:'改名'})).status,200);
      const {input} = (await loser.state()).round;
      assert.equal((await loser.send('word',{card:input.id,word:'ABC'})).status,200);
    }
    await host.send('end');
    await host.send('start');
    const next = (await host.state()).round;
    await players[next.setter].send('topic',{word:'別対戦'});
    const writer = Object.values(players).find(p=>p.name!==next.parent);
    const current = (await writer.state()).round.input;
    assert.equal((await writer.send('word',{card:current.id,word:'ABC'})).status,200);
    assert.equal(h.raw().round.cards.filter(card=>card.word).length,1);
  }
});

test('tier guessing rejects empty tiers and keeps all placements for correction',async()=>{
  const {parent,players,setter} = await round(2);
  await setter.send('topic',{word:'空のTier'});
  for (const player of Object.values(players).filter(p=>p!==parent)) {
    for (let i=0;i<2;i++) {
      const {input} = (await player.state()).round;
      await player.send('word',{card:input.id,word:player.name+i});
    }
  }
  for (let i=0;i<4;i++) {
    const {current} = (await parent.state()).round;
    await parent.send('place',{card:current.id,tier:'A'});
  }
  const before = (await parent.state()).round;
  const refused = await parent.send('submit');
  assert.equal(refused.code,'incompleteBoard');
  assert.match(refused.error,/未使用：B、C/);
  assert.deepEqual((await parent.state()).round.cards,before.cards);
  for (const [i,tier] of ['B','C'].entries()) {
    const card = before.cards[i].id;
    await parent.send('select',{card});
    await parent.send('place',{card,tier});
  }
  assert.equal((await parent.send('submit')).status,200);
});

test('consensus isolates HTTP views, compares finalized boards, and saves one complete history',async()=>{
  for (const withMismatch of [false,true]) {
    const {h,c,setter,topic,players} = await round(4,{mode4ShowAuthors:withMismatch});
    let {host,b} = players;
    const entrants = Object.values(players);
    assert.equal((await h.req('join',{name:b.name},b.token)).token,b.token);
    const watcher = await h.join('watcher');
    assert.equal((await setter.send('topic',{word:topic})).status,200);
    const initial = (await host.state()).round;
    for (const i of [0,1]) {
      const results = await Promise.all(entrants.map(async player=>{
        const r = (await player.state()).round;
        assert.equal(r.inputRemaining,2-i);
        assert.ok(r.input.tier);
        return player.send('word',{card:r.input.id,word:player.name+i},r);
      }));
      assert.ok(results.every(response=>response.status===200));
      if (i===0) {
        const previous = b;
        const before = (await previous.state()).round;
        b = await h.join(previous.name);
        assert.ok(b.token);
        assert.notEqual(b.token,previous.token);
        assert.equal((await previous.get()).status,401);
        assert.deepEqual((await b.state()).round,before);
        entrants[entrants.indexOf(previous)] = b;
        for (const player of entrants) {
          const view = await player.state();
          assert.deepEqual(view.round.ownCards.map(card=>card.word),[player.name+i]);
          assert.deepEqual(view.round.cards,[]);
          assert.ok(view.players.filter(p=>!p.spectator).every(p=>p.mark===1));
        }
        assert.deepEqual((await watcher.state()).round.cards,[]);
        assert.equal((await watcher.state()).round.ownCards,undefined);
      }
    }
    const opening = await Promise.all(entrants.map(player=>player.state()));
    const order = opening[0].round.displayOrder;
    assert.equal(order.length,6);
    assert.equal(opening[0].round.version,initial.version+1);
    for (const {round:r} of opening) {
      assert.equal(r.phase,'placement');
      assert.deepEqual(r.displayOrder,order);
      assert.deepEqual(r.unplaced.map(card=>card.id),order);
      assert.equal(r.current.id,order[0]);
      assert.ok(r.unplaced.every(card=>!Object.hasOwn(card,'answer') && Object.hasOwn(card,'owner')===withMismatch));
    }
    assert.deepEqual((await watcher.state()).round.cards,[]);
    assert.equal((await host.send('submit')).code,'incompleteBoard');
    for (const [i,card] of order.entries()) {
      const results = await Promise.all(entrants.map((player,index)=>
        player.send('place',{card,tier:index===0?'A':['B','C','A'][i%3]})));
      assert.ok(results.every(response=>response.status===200));
      const second = await b.state();
      if (i===0) {
        const previous = b;
        b = await h.join(previous.name);
        assert.equal((await previous.send('place',{card,tier:'C'},second.round)).status,401);
        assert.deepEqual((await b.state()).round,second.round);
        entrants[entrants.indexOf(previous)] = b;
      }
      assert.equal(second.round.remaining,order.length-i-1);
      assert.ok(second.round.cards.every((card,j)=>card.placed===['B','C','A'][j%3]));
      assert.equal(second.players.find(player=>player.id===host.name).mark<=order.length-i-1,true);
      if (i<order.length-1) assert.equal(second.round.current.id,order[i+1]);
    }
    const failed = await host.send('submit');
    assert.equal(failed.code,'incompleteBoard');
    assert.match(failed.error,/未使用：B、C/);
    for (const [i,id] of order.entries()) {
      if (i%3!==2) assert.equal((await host.send('place',{card:id,tier:['B','C'][i%3]})).status,200);
    }
    if (withMismatch) assert.equal((await host.send('place',{card:order[0],tier:'C'})).status,200);
    const draft = (await host.state()).round;
    assert.deepEqual(draft.displayOrder,order);
    assert.equal(draft.cards.length,6);
    assert.equal((await b.state()).players.find(p=>p.id===host.name).mark,0);
    const payload = {type:'submit',id:crypto.randomUUID(),game:'tier',scope:draft.id,round:draft.id,version:draft.version,draftRevision:draft.draftRevision};
    assert.equal((await h.req('action',payload,host.token)).status,200);
    assert.equal((await h.req('action',payload,host.token)).status,200);
    const originalHost = host;
    const submitted = (await originalHost.state()).round;
    host = await h.join(originalHost.name);
    assert.equal((await originalHost.get()).status,401);
    const resumed = await host.state();
    assert.equal(resumed.host,host.name);
    assert.deepEqual(resumed.round,submitted);
    h.advance(16_000);
    const wait = (await host.state()).round;
    assert.equal(wait.final,true);
    assert.deepEqual(wait.cards,draft.cards);
    assert.equal(wait.remaining,0);
    assert.equal(wait.canPlace,undefined);
    assert.notDeepEqual((await b.state()).round.cards,wait.cards);
    assert.deepEqual((await watcher.state()).round.cards,[]);
    assert.equal(wait.displayOrder,undefined);
    assert.equal(wait.result,undefined);
    assert.equal((await host.send('place',{card:order[0],tier:'A'})).status,409);
    assert.equal((await b.state()).players.find(p=>p.id===host.name).mark,'done');
    assert.deepEqual((await host.history()).record,[]);
    const finished = await Promise.all([b.send('submit'),c.send('submit')]);
    assert.ok(finished.every(response=>response.status===200));
    const result = (await host.state()).round;
    assert.equal(result.phase,'result');
    assert.equal(result.result.win,!withMismatch);
    assert.equal(result.result.matched,withMismatch?5:6);
    assert.deepEqual(result.result.mismatched,withMismatch?[order[0]]:[]);
    assert.ok(result.cards.every(card=>card.owner && card.answer));
    const history = await host.history();
    assert.equal(history.record.length,1);
    assert.equal((await host.history(result.id)).record.modeName,'全員一致モード');
    const saved = (await host.history(result.id)).record;
    assert.deepEqual(saved.result,result.result);
    assert.deepEqual(saved.cards,result.cards);
    assert.deepEqual(saved.players,result.players);
    assert.equal(saved.settings.mode4ShowAuthors,withMismatch);
    await host.send('lobby');
    assert.deepEqual((await host.history(result.id)).record,saved);
  }
});

test('a ten-person consensus match persists all 100 cards, ten boards and seven tiers',async()=>{
  const h=harness();
  const players=[];
  for (let i=0;i<10;i++) players.push(await h.join('player'+i));
  const [host] = players;
  await host.send('choose',{choice:'tier'});
  await host.send('settings',{settings:{mode:4,cardsPerPlayer:10,difficulty:'hard',nominatedMode1Setter:host.name}});
  await host.send('start');
  await host.send('topic',{word:'最大人数と枚数'});
  for (const player of players) {
    for (let i=0;i<10;i++) {
      const {input} = (await player.state()).round;
      assert.equal((await player.send('word',{card:input.id,word:player.name+'-'+i})).status,200);
    }
  }
  for (const player of players) {
    for (let i=0;i<100;i++) {
      const {round,tiers} = await player.state();
      assert.equal((await player.send('place',{card:round.current.id,tier:tiers[i%7]},round)).status,200);
    }
    assert.equal((await player.send('submit')).status,200);
  }
  const {round} = await host.state();
  const {record} = await host.history(round.id);
  assert.equal(record.cards.length,100);
  assert.equal(record.result.matched,100);
  assert.deepEqual(record.result.boards.map(board=>Object.keys(board).length),Array(10).fill(100));
});

test('lobby synchronizes hosts, settings and player order across games and restarts',async()=>{
  const h=harness();
  const host=await h.join('host'), guest=await h.join('guest'), third=await h.join('third');
  assert.equal((await guest.state()).game,null);
  assert.equal((await guest.send('browse',{choice:'circle-cross'})).status,409);
  assert.equal((await guest.send('choose',{choice:'tier'})).status,409);
  assert.equal((await host.send('shuffle')).status,200);
  const order = (await guest.state()).players.map(p=>p.id);
  assert.deepEqual([...order].sort(),['guest','host','third']);
  assert.equal((await guest.state()).host,'host');
  assert.equal((await host.send('choose',{choice:'tier'})).status,200);
  const tier = await host.state();
  await host.send('settings',{settings:{difficulty:'hard',cardsPerPlayer:4,mode:1,mode1Lives:6}});
  await host.send('settings',{settings:{mode:2,mode2Target:90}});
  await host.send('settings',{settings:{mode:1}});
  assert.equal((await guest.state()).settings.mode1Lives,6);
  await host.send('settings',{settings:{mode:2}});
  assert.equal((await guest.state()).settings.mode2Target,90);
  await host.send('settings',{settings:{mode:1}});
  assert.equal((await guest.send('commonSettings',{minutes:300})).status,409);
  assert.equal((await host.send('commonSettings',{minutes:300})).status,200);
  assert.equal((await host.send('lobby')).status,200);
  await host.send('browse',{choice:'circle-cross'});
  assert.equal((await guest.state()).selectedGame,'circle-cross');
  await host.send('choose',{choice:'circle-cross'});
  const delayed = await h.req('action',{id:crypto.randomUUID(),type:'start',
    scope:tier.scope,game:'tier',round:null,version:0},host.token);
  assert.equal(delayed.code,'stale');
  assert.deepEqual((await guest.state()).players.map(p=>p.id),order);
  await guest.send('leave');
  await third.send('leave');
  assert.match((await host.state()).startProblem,/2人以上/);
  assert.equal((await host.send('start')).status,409);
  await host.send('leave');
  const next = await h.join('next');
  assert.equal((await next.state()).game,null);
  assert.equal((await next.state()).common.historyMinutes,300);
  await next.send('choose',{choice:'tier'});
  const restored = (await next.state()).settings;
  assert.equal(restored.difficulty,'hard');
  assert.equal(restored.cardsPerPlayer,4);
  assert.equal(restored.mode1Lives,6);
});

test('Circle & Cross keeps hosted rules and hand privacy through takeover and stores one scoped history',async()=>{
  const h=harness();
  let host=await h.join('host');
  let guest=await h.join('guest');
  await host.send('browse',{choice:'circle-cross'});
  await host.send('choose',{choice:'circle-cross'});
  for (let i=0;i<5;i++) await h.join('extra'+i);
  assert.match((await host.state()).startProblem,/6人まで/);
  assert.equal((await host.send('start')).status,409);
  for (let i=0;i<5;i++) await host.send('kick',{player:'extra'+i});
  assert.equal((await host.send('start')).status,200);
  assert.equal((await host.send('settings',{settings:{mode:2}})).status,409);
  const initial=(await host.state()).round;
  assert.deepEqual(initial.players.map(p=>p.name),['host','guest']);
  assert.deepEqual(initial.players.map(p=>p.cards),[['○','○','○','×'],null]);
  const oldGuest = guest;
  guest = await h.join('guest');
  assert.equal((await oldGuest.get()).status,401);
  assert.deepEqual((await guest.state()).round.players.map(p=>p.cards),[null,['○','○','○','×']]);
  const byIndex = [host,guest], challenger = byIndex[initial.parent], opponent = byIndex[1-initial.parent];

  async function challenge(card) {
    assert.equal((await challenger.send('place',{card})).status,200);
    assert.equal((await opponent.send('place',{card:0})).status,200);
    assert.equal((await challenger.send('bid',{value:1})).status,200);
    assert.equal((await opponent.send('pass')).status,200);
    assert.equal((await challenger.send('reveal',{target:1-initial.parent})).status,409);
    assert.equal((await challenger.send('reveal',{target:initial.parent})).status,200);
  }
  await challenge(3);
  assert.equal((await challenger.state()).round.phase,'loss');
  assert.equal((await opponent.send('lose',{card:3})).status,409);
  assert.equal((await challenger.send('lose',{card:3})).status,200);
  assert.equal((await challenger.state()).round.players[initial.parent].count,3);
  assert.equal((await challenger.send('next')).status,200);
  await challenge(0);
  assert.equal((await challenger.send('next')).status,200);
  await challenge(0);
  const result = (await host.state()).round;
  assert.equal(result.phase,'finished');
  assert.equal(result.winner,initial.parent);
  const saved = (await guest.history(result.id)).record;
  assert.equal(saved.gameId,'circle-cross');
  assert.equal(saved.winner,challenger.name);
  assert.deepEqual(saved.board.players.map(p=>p.cards),[null,null]);
  assert.equal((await host.history()).record.length,1);
  assert.equal((await host.send('lobby')).status,200);
  assert.equal((await guest.history()).record.length,1);
  await host.send('browse',{choice:'tier'});
  await host.send('choose',{choice:'tier'});
  assert.deepEqual((await guest.history()).record,[]);
  assert.equal((await guest.history(result.id)).status,404);
  assert.equal((await host.send('resetHistory')).status,200);
  await host.send('lobby');
  assert.equal((await guest.history()).record.length,1);
  await host.send('resetHistory');
  assert.deepEqual((await guest.history()).record,[]);
});

test('published version, reduced state responses, and previously stored room and history are compatible',async()=>{
  const h=harness();
  assert.equal((await h.req('version')).version,VERSION);
  const host=await h.join('host'), guest=await h.join('guest');
  const lobby = await host.get();
  const small = await h.req('state',null,host.token,{
    'X-Room-Revision':String(lobby.revision),'X-Room-Online':lobby.online,
  });
  assert.equal(small.unchanged,true);
  assert.equal(small.state,undefined);
  const oldStart = await h.req('action',{id:crypto.randomUUID(),type:'choose',scope:null,game:null,choice:'tier'},
    host.token,{'X-App-Version':'1.9.9'});
  assert.equal(oldStart.code,'updateRequired');

  await host.send('choose',{choice:'tier'});
  await host.send('start');
  const stored = h.raw();
  delete stored.game;
  delete stored.scope;
  delete stored.selectedGame;
  delete stored.common;
  h.sqlite.prepare('UPDATE room SET state=?').run(JSON.stringify(stored));
  const legacy = await host.state();
  assert.equal(legacy.game,'tier');
  assert.equal(legacy.round.id,stored.round.id);
  assert.equal(legacy.common.historyMinutes,120);
  const setter = stored.round.setter===host.name ? host : guest;
  const legacyTopic = await h.req('action',{type:'topic',id:crypto.randomUUID(),round:stored.round.id,
    version:stored.round.version,word:'継続テスト'},setter.token,{'X-App-Version':'1.3.1'});
  assert.equal(legacyTopic.status,200);

  const summary = {id:crypto.randomUUID(),endedAt:100,expiresAt:100+30*60_000,topic:'旧履歴'};
  h.sqlite.prepare('INSERT INTO round_history VALUES (?,?,?,?)')
    .run(summary.id,summary.endedAt,JSON.stringify(summary),JSON.stringify(summary));
  assert.equal((await host.history(summary.id)).record.gameId,'tier');
  h.advance(31*60_000);
  assert.equal((await host.history(summary.id)).status,200);
  assert.equal((await host.send('commonSettings',{minutes:30})).status,200);
  assert.equal((await host.history(summary.id)).status,404);
});

test('update information keeps every past release and filters shared changes by game',()=>{
  const all = releaseEntries();
  const tier = releaseEntries('tier');
  const circle = releaseEntries('circle-cross');
  assert.deepEqual(tier.map(entry=>entry.version),all.map(entry=>entry.version));
  assert.equal(circle.length,1);
  assert.equal(all[0].version,VERSION);
  assert.equal(tier[0].version,VERSION);
  assert.equal(circle[0].version,'2.0.0');
  const previous = tier.find(entry=>entry.version===circle[0].version);
  const shared = previous.changes.find(change=>change.gameIds.includes('circle-cross'));
  assert.ok(circle[0].changes.includes(shared));
  assert.ok(all.find(entry=>entry.version==='2.0.0').changes.some(change=>!change.gameIds.length));
  assert.ok([...tier[0].changes,...circle[0].changes].every(change=>change.gameIds.length));
});
