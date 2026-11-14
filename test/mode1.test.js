import test from 'node:test';
import assert from 'node:assert/strict';
import {initialRoom,join} from '../server/room.js';
import {action} from '../server/game.js';
import {draw} from '../server/draw.js';
import {visible} from '../server/visibility.js';
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

test('mode 1 early Bad rejection, full attendance for judgement, retries, and host-only progression', () => {
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
  vote(voters[0],'good');
  vote(voters[1],'bad');
  assert.equal(r.phase,'vote');
  vote(voters[2],'bad');
  assert.equal(r.phase,'placement');
  const mark = p => visible(s,players[0].id,now).players.find(entry=>entry.id===p.id).mark;
  assert.deepEqual(voters.map(mark),['good','bad','bad',null]);
  assert.equal(r.lives,3);
  send(voters[0],'propose',{card:card.id,tier:wrong});
  assert.deepEqual(voters.map(mark),[null,null,null,null]);
  vote(voters[0],'good');
  assert.equal(r.votes[voters[0].id],'good');
  assert.throws(()=>vote(voters[0],'good'));
  vote(voters[1],'good');
  vote(voters[2],'good');
  assert.equal(r.phase,'vote');
  vote(voters[3],'bad');
  assert.equal(r.phase,'turnResult');
  assert.deepEqual(voters.map(p=>r.votes[p.id]),['good','good','good','bad']);
  assert.equal(r.lives,2);
  assert.equal(r.feedback.answer,undefined);
  assert.throws(()=>send(players[1],'next'));
  send(players[0],'next');
  assert.equal(card.word,'ゴリラ');
  assert.throws(()=>send(voters[0],'propose',{card:card.id,tier:wrong}));
  send(voters[0],'propose',{card:card.id,tier:card.answer});
  vote(voters[0],'good');
  voters.slice(1).forEach(p=>vote(p,'good'));
  assert.ok(card.fixed);
  assert.equal(r.turn,0);
  send(players[0],'next');
  assert.equal(r.turn,1);
  assert.deepEqual(r.votes,{});
});

test('mode 1 repeats one shuffled order and keeps the correct tier visible under a locked wrong placement', () => {
  const s=initialRoom(), now=1;
  const players=['a','b','c','d'].map(name=>join(s,name,now));
  const send=(p,type,extra={})=>action(s,p,{type,round:s.round?.id??null,version:s.round?.version??0,...extra},now);
  send(players[0],'start');
  const r=s.round;
  const owners=r.cards.map(c=>c.owner);
  const first=owners.slice(0,players.length);
  assert.deepEqual([...first].sort(),players.map(p=>p.id));
  assert.deepEqual(owners,[...first,...first,...first]);
  send(players.find(p=>p.id===r.setter),'topic',{source:'random'});
  const card=r.cards[0], author=players.find(p=>p.id===card.owner), voters=players.filter(p=>p!==author);
  const wrong=r.tiers.find(t=>t!==card.answer);
  send(author,'word',{card:card.id,word:'ゴリラ'});
  send(voters[0],'propose',{card:card.id,tier:wrong});
  const proposal=r.proposal.id;
  voters.forEach(p=>send(p,'vote',{proposal,choice:'good'}));
  assert.equal(r.phase,'turnResult');
  assert.equal(card.placed,wrong);
  assert.ok(card.fixed);
  assert.equal(r.feedback.answer,card.answer);
  const cardFrom=p=>visible(s,p.id,now).round.cards.find(c=>c.id===card.id);
  assert.equal(cardFrom(voters[0]).answer,card.answer);
  send(players[0],'next');
  assert.equal(cardFrom(voters[0]).answer,card.answer);
  assert.equal(cardFrom(voters[0]).placed,wrong);
});
