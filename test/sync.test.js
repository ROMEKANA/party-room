import assert from 'node:assert/strict';
import test from 'node:test';
import {connect,storedAvatarId} from '../web/sync.js';
import {VERSION} from '../web/version.js';

test('an update waits for the final result, reloads once and rejoins by name',async t=>{
  const timer = new Map();
  const scheduled = callback => {
    const id = Symbol();
    timer.set(id,callback);
    return id;
  };
  const storage = () => {
    const values = new Map();
    return {getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  };
  const local = storage(), session = storage();
  session.setItem('tier-studio-session','old-session');
  const href = new URL('https://party.example/');
  let navigated;
  let now = 0, playing = true;
  const nextVersion = VERSION.replace(/\d+$/, patch=>String(Number(patch)+1));
  let published = nextVersion;
  const calls = [], updates = [];
  const browser = {
    sessionStorage:session,localStorage:local,document:{hidden:false,addEventListener(){}},
    window:{addEventListener(){}},location:{href,replace:url=>{navigated=url;}},
    setTimeout:scheduled,clearTimeout:id=>timer.delete(id),
    fetch:async(url,options)=>{
      calls.push([url,options]);
      return Response.json({revision:++now,at:now,version:published,online:'1',
        state:{playing,me:'ホスト',players:[{id:'ホスト',avatarId:'ghost'}]},...(url==='/api/join'?{token:'new-session'}:{})});
    },
  };
  for (const [key,value] of Object.entries(browser)) {
    const before = Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
    t.after(()=>before ? Object.defineProperty(globalThis,key,before) : delete globalThis[key]);
  }
  const sync = connect(()=>{},()=>{},()=>{},version=>updates.push(version));
  await Promise.resolve();
  const poll = async()=>{
    const [id,callback] = timer.entries().next().value;
    timer.delete(id);
    await callback();
  };
  await poll();
  assert.equal(updates.at(-1),null);
  playing = false;
  await poll();
  assert.equal(updates.at(-1),nextVersion);
  assert.equal(await sync.send('start'),false);
  sync.refresh(nextVersion);
  assert.ok(navigated.searchParams.get('version').startsWith(nextVersion+'-'));
  assert.deepEqual(JSON.parse(session.getItem('party-room-refresh')),{version:nextVersion,name:'ホスト'});
  assert.equal(calls.every(([url])=>url==='/api/state'),true);
  assert.equal(calls[0][1].headers['X-App-Version'],VERSION);

  // A newly loaded build handles the stored resume marker and needs no room leave.
  session.setItem('party-room-refresh',JSON.stringify({version:VERSION,name:'ホスト'}));
  timer.clear();
  published = VERSION;
  let resumed;
  connect(state=>{resumed=state.me;},()=>{},()=>{},()=>{});
  for (let i=0;i<20 && !resumed;i++) await Promise.resolve();
  const [url,options] = calls.at(-1);
  assert.equal(url,'/api/join');
  assert.deepEqual(JSON.parse(options.body),{name:'ホスト'});
  assert.equal(resumed,'ホスト');
  assert.equal(storedAvatarId(),'ghost');
  assert.equal(local.getItem('tier-studio-name'),'ホスト');
  assert.equal(session.getItem('tier-studio-session'),'new-session');
  assert.equal(session.getItem('party-room-refresh'),undefined);
});
