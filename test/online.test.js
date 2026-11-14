import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../dist/server/index.js';
import {api} from '../server/api.js';

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
  const req = async (route, payload, token) => {
    const request = new Request('https://tier.test/api/'+route,{
      method:payload?'POST':'GET',body:payload?JSON.stringify(payload):undefined,
      headers:token?{Authorization:'Bearer '+token}:{},
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
      const r = base === undefined ? (await get()).state?.round : base;
      return req('action',{id:crypto.randomUUID(),round:r?.id??null,version:r?.version??0,type,...fields},token);
    };
    return {name,token,get,history,send,state:async()=>(await get()).state};
  }
  const raw = () => JSON.parse(sqlite.prepare('SELECT state FROM room').get().state);
  return {join,raw,req,advance:ms=>{now+=ms;},db};
}

test('Worker artifact serves UI, stores game in database binding and isolates public asset paths',async()=>{
  const h=harness();
  const base='https://tier.test';
  assert.match(await (await worker.fetch(new Request(base),{DB:h.db})).text(),/Tier表予想ゲーム/);
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
  const set=await host.send('settings',{settings:{mode,difficulty:'easy',cardsPerPlayer:2,...extra}});
  assert.equal(set.status,200);
  assert.equal((await b.send('settings',{settings:{mode:1}})).status,409);
  assert.equal((await host.send('start')).status,200);
  const r=(await host.state()).round;
  return {h,host,b,c,players,parent:players[r.parent],setter:players[r.setter],topic:'公開制御の確認用お題'};
}
test('mode 2 perfect and accuracy through independent HTTP sessions',async()=>{
  for (const mode2Rule of ['perfect','accuracy']) {
    const {h,host,players,parent,setter,topic}=await round(2,{mode2Rule,mode2Attempts:2,mode2Target:70});
    const initial = mode2Rule==='perfect' ? 2 : 1;
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
    for (const id of [...h.raw().round.queue]) {
      const answer=h.raw().round.cards.find(c=>c.id===id).answer;
      await replaced.send('place',{card:id,tier:mode2Rule==='perfect'?'A':answer});
    }
    assert.equal((await replaced.send('submit')).status,200);
    const activeHost=parent===host?replaced:host;
    if (mode2Rule==='perfect') {
      r=(await child.state()).round;
      assert.equal(r.phase,'attemptResult');
      assert.ok(r.feedback.score<4);
      assert.deepEqual([r.lives,r.initialLives],[1,2]);
      assert.deepEqual((await activeHost.history()).record,[]);
      assert.ok(r.cards.every(c=>!Object.hasOwn(c,'answer')));
      await activeHost.send('next');
      for (const card of h.raw().round.cards) {
        await replaced.send('select',{card:card.id});
        await replaced.send('place',{card:card.id,tier:card.answer});
      }
      await replaced.send('submit');
      await activeHost.send('next');
    }
    r=(await replaced.state()).round;
    assert.equal(r.phase,'result');
    assert.equal(r.result.win,true);
    assert.ok(r.cards.every(c=>c.answer===c.placed));
    assert.deepEqual([r.lives,r.initialLives],[1,initial]);
    const saved = (await activeHost.history(r.id)).record.result;
    assert.deepEqual([saved.lives,saved.initialLives],[1,initial]);
    assert.equal((await activeHost.send('lobby')).status,200);
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

test('mode 1 nomination is one-time and skips no one in random rotation; mode 2 cannot nominate the parent as setter',async()=>{
  const h=harness();
  const [host,b,c]=await Promise.all(['h','b','c'].map(name=>h.join(name)));
  const owner=[host,b,c].find(p=>p.name===h.raw().host);
  const player=owner===b?c:b;
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
  assert.equal((await owner.send('settings',{settings:{mode:2,nominatedSetter:player.name}})).status,409);
  assert.equal((await owner.send('settings',{settings:{mode:2,nominatedParent:player.name,nominatedSetter:player.name}})).status,409);
  assert.equal((await owner.send('settings',{settings:{mode:2,nominatedParent:player.name,nominatedSetter:owner.name}})).status,200);
  assert.equal((await owner.send('settings',{settings:{nominatedParent:null}})).state.settings.nominatedSetter,null);
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
  const {host,parent,players,setter}=await round(2,{mode2Rule:'accuracy'});
  await setter.send('topic',{word:'配置順'});
  for (const player of Object.values(players).filter(p=>p!==parent)) {
    for (let i=0;i<2;i++) {
      const {input} = (await player.state()).round;
      await player.send('word',{card:input.id,word:player.name+i});
    }
  }
  const order = [];
  for (let i=0;i<4;i++) {
    const {current} = (await parent.state()).round;
    order.push(current.id);
    await parent.send('place',{card:current.id,tier:'A'});
  }
  assert.deepEqual((await host.state()).round.cards.map(c=>c.id),order);
  const [first,...rest] = order;
  await parent.send('select',{card:first});
  await parent.send('place',{card:first,tier:'A'});
  await parent.send('submit');
  const final = (await host.state()).round;
  assert.deepEqual(final.cards.map(c=>c.id),[...rest,first]);
  const saved = (await host.history(final.id)).record;
  assert.deepEqual(saved.cards.map(c=>c.id),[...rest,first]);
  assert.ok(saved.players.every(p=>!Object.hasOwn(p,'score')));
  assert.deepEqual([final.lives,final.initialLives],[0,1]);
  assert.deepEqual([saved.result.lives,saved.result.initialLives],[0,1]);
});

test('mode 2 perfect history saves the last submission even when a previous answer scored higher',async()=>{
  const {h,host,parent,players,setter}=await round(2,{mode2Attempts:3});
  await setter.send('topic',{word:'最後の回答'});
  for (const child of Object.values(players).filter(player=>player!==parent)) {
    for (let i=0;i<2;i++) {
      const {input} = (await child.state()).round;
      await child.send('word',{card:input.id,word:child.name+i});
    }
  }
  const wrongTier = card=>['A','B','C'].find(tier=>tier!==card.answer);
  const cards = h.raw().round.cards;
  for (const id of h.raw().round.queue) {
    const card = cards.find(c=>c.id===id);
    await parent.send('place',{card:id,tier:card===cards[0]?wrongTier(card):card.answer});
  }
  for (let attempt=1;attempt<=3;attempt++) {
    if (attempt>1) {
      const card = cards[attempt-1];
      await parent.send('select',{card:card.id});
      await parent.send('place',{card:card.id,tier:wrongTier(card)});
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
