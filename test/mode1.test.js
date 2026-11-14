import test from 'node:test';
import assert from 'node:assert/strict';
import {initialRoom,join} from '../server/room.js';
import {action} from '../server/game.js';
import {draw} from '../server/draw.js';
import {DEFAULTS,TIERS} from '../web/config.js';

test('all draws guarantee every tier and balanced counts; hard mode prerequisites', () => {
  for (const [difficulty,tiers] of Object.entries(TIERS)) {
    for (const randomMode of ['balanced','random','centerWeighted']) {
      for (let n=tiers.length; n<=100; n++) {
        const deck = draw({...DEFAULTS,difficulty,randomMode},n);
        const counts = tiers.map(tier => deck.filter(t => t === tier).length);
        assert.equal(deck.length,n);
        assert.ok(counts.every(Boolean));
        if (randomMode === 'balanced') assert.ok(Math.max(...counts)-Math.min(...counts)<=1);
        if (difficulty === 'hard') {
          assert.ok(deck.indexOf('SS') > deck.indexOf('S'));
          assert.ok(deck.indexOf('E') > deck.indexOf('D'));
        }
      }
    }
  }
});

test('mode 1 rejection, half threshold, stale actions, retries, and host-only progression', () => {
  const s=initialRoom(), now=1;
  const players = ['a','b','c','d','e'].map(name=>join(s,name,now));
  s.settings.mode1Wrong='retry';
  const send=(p,type,extra={})=>action(s,p,{type,round:s.round?.id??null,version:s.round?.version??0,...extra},now);
  send(players[0],'start');
  const r=s.round;
  send(players.find(p=>p.id===r.setter),'topic');
  const card=r.cards[0], author=players.find(p=>p.id===card.owner), voters=players.filter(p=>p!==author);
  const wrong=r.tiers.find(t=>t!==card.answer);
  send(author,'word',{card:card.id,word:'ゴリラ'});
  const version=r.version;
  send(voters[0],'propose',{card:card.id,tier:wrong});
  assert.throws(()=>send(voters[1],'propose',{card:card.id,tier:card.answer,version}));
  const vote=(p,choice)=>send(p,'vote',{proposal:r.proposal.id,choice});
  assert.throws(()=>vote(author,'good'));
  voters.forEach(p=>vote(p,'bad'));
  assert.equal(r.phase,'placement');
  assert.deepEqual(r.votes,{});
  assert.equal(r.lives,3);
  send(voters[0],'propose',{card:card.id,tier:wrong});
  vote(voters[0],'good');
  assert.equal(r.votes[voters[0].id],'good');
  assert.throws(()=>vote(voters[0],'good'));
  vote(voters[1],'good');
  assert.equal(r.phase,'turnResult');
  assert.equal(r.lives,2);
  assert.equal(r.feedback.answer,undefined);
  assert.throws(()=>send(players[1],'next'));
  send(players[0],'next');
  assert.equal(card.word,'ゴリラ');
  assert.throws(()=>send(voters[0],'propose',{card:card.id,tier:wrong}));
  send(voters[0],'propose',{card:card.id,tier:card.answer});
  vote(voters[0],'good');
  vote(voters[1],'good');
  assert.ok(card.fixed);
  assert.equal(r.turn,0);
  send(players[0],'next');
  assert.equal(r.turn,1);
  assert.deepEqual(r.votes,{});
});
