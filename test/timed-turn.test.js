import test from 'node:test';
import assert from 'node:assert/strict';
import {timedTurnUI} from '../web/timed-turn.js';

test('timed turn paints from server time and cancels its frame on update, close and disposal', t=>{
  const node = () => ({
    children:[],style:{},textContent:'',
    append(...children) { this.children.push(...children); },
  });
  const globals = {
    document:{createElement:node},
    requestAnimationFrame:callback => {
      frames.set(++frameId,callback);
      return frameId;
    },
    cancelAnimationFrame:id=>frames.delete(id),
  };
  for (const [key,value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{value,configurable:true});
    t.after(()=>{
      if (descriptor) Object.defineProperty(globalThis,key,descriptor);
      else delete globalThis[key];
    });
  }

  let frameId = 0;
  let now = 999;
  const frames = new Map();
  const tick = time => {
    now = time;
    assert.equal(frames.size,1);
    const [id,next] = frames.entries().next().value;
    frames.delete(id);
    next();
  };
  const changes = [];
  const root = node();
  const controller = new AbortController();
  const timer = timedTurnUI(root,{serverNow:()=>now,onOpenChange:open=>changes.push(open),signal:controller.signal});
  const round = {phase:'prepare',startsAt:1000,endsAt:3000};
  timer.update(round,{title:'ターン 1'});
  const [[heading,track]] = root.children.map(child=>child.children);
  const [title,clock] = heading.children;

  assert.equal(title.textContent,'ターン 1');
  assert.equal(clock.textContent,'ターン開始待ち');
  assert.equal(timer.isOpen(),false);
  assert.equal(track.children[0].style.transform,'scaleX(1)');
  tick(1000);
  assert.equal(clock.textContent,'2秒');
  assert.equal(timer.isOpen(),true);
  timer.update({...round,phase:'select'},{title:'ターン 1'});
  tick(2500);
  assert.equal(clock.textContent,'1秒');
  assert.equal(track.children[0].style.transform,'scaleX(0.25)');
  tick(3000);
  assert.equal(clock.textContent,'結果を確定中');
  assert.equal(timer.isOpen(),false);
  assert.equal(frames.size,0);

  timer.update({...round,phase:'review'},{title:'ターン 1',label:'ターン結果'});
  assert.equal(clock.textContent,'ターン結果');
  assert.equal(track.hidden,true);

  timer.update({phase:'prepare',startsAt:3500,endsAt:null},{title:'ターン 2'});
  tick(3500);
  assert.equal(clock.textContent,'制限時間なし');
  assert.equal(timer.isOpen(),true);
  assert.equal(track.hidden,true);
  assert.equal(frames.size,0);

  timer.update({phase:'prepare',startsAt:4000,endsAt:6000},{title:'ターン 3'});
  assert.equal(frames.size,1);
  controller.abort();
  timer.update(round,{title:'ターン 1'});
  assert.equal(timer.isOpen(),false);
  assert.equal(frames.size,0);
  assert.deepEqual(changes,[false,true,true,false,false,false,true,false]);
});
