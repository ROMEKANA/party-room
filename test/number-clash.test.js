import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceNumberClash,judgeNumberClash,numberRankings,numberSettings,numberView,startNumberClash,submitNumberCard} from '../server/number-clash.js';
import {NUMBER_DEFAULTS,handCards,pointCards} from '../web/number-clash-rules.js';

test('Number Clash creates the expected hands and shuffled point cards for every size and player count',()=>{
  for (const [size,min,max] of [[9,-3,6],[12,-4,8],[15,-5,10]]) {
    for (let count=2;count<=6;count++) {
      const ids=Array.from({length:count},(_,index)=>'P'+index);
      const settings=numberSettings(NUMBER_DEFAULTS,{handSize:size});
      const round=startNumberClash(ids,settings,0);
      assert.deepEqual(round.players.map(({unused,score})=>[unused,score]),ids.map(()=>[handCards(size),0]));
      assert.deepEqual([...round.deck,...round.table].sort((a,b)=>a-b),
        [...Array.from({length:-min},(_,index)=>min+index),...handCards(max)]);
      assert.deepEqual([...round.deck,...round.table].sort((a,b)=>a-b),pointCards(size));
      assert.equal(round.turn,1);
      assert.equal(round.table.length,1);
    }
  }
  for (const patch of [{handSize:10},{carryExtreme:1},{seconds:2},{penalty:-1},{revealMs:0}]) {
    assert.throws(()=>numberSettings(NUMBER_DEFAULTS,patch),{status:400});
  }
});

test('Number Clash adjudicates both extremes, multiple duplicate groups, different signs and zero',()=>{
  const cases=[
    {table:[6],cards:[9,9,7,3],on:null,off:2,duplicates:[0,1]},
    {table:[6],cards:[9,7,7,3],on:0,off:0,duplicates:[1,2]},
    {table:[-4],cards:[1,1,3,8],on:null,off:2,duplicates:[0,1]},
    {table:[-4],cards:[1,3,3,8],on:0,off:0,duplicates:[1,2]},
    {table:[5],cards:[3,3,7,7],on:null,off:null,duplicates:[0,1,2,3]},
    {table:[-5,3,2],cards:[9,9,7,7,3,3],on:null,off:null,duplicates:[0,1,2,3,4,5]},
    {table:[-5,5],cards:[9,9,2,1],on:null,off:2,duplicates:[0,1]},
    {table:[-5,5],cards:[9,2,2,1],on:0,off:0,duplicates:[1,2]},
    {table:[-3,8],cards:[9,8,8,8,7,7],on:0,off:0,duplicates:[1,2,3,4,5]},
  ];
  const name=index=>'P'+index;
  for (const {table,cards,on,off,duplicates} of cases) {
    const plays=cards.map((card,index)=>({id:name(index),card}));
    for (const [carryExtreme,winner] of [[true,on],[false,off]]) {
      const expected={winner:winner===null ? null : name(winner),duplicates:duplicates.map(name),
        total:table.reduce((sum,value)=>sum+value,0)};
      assert.deepEqual(judgeNumberClash(plays,table,{carryExtreme}),expected);
    }
  }
});

test('Number Clash holds every card across 15 tied turns, penalizes each player once and discards the final pot',()=>{
  for (const penalty of [0,1,2,3]) {
    const ids=['__proto__','constructor','第三プレイヤー'];
    const round=startNumberClash(ids,{...NUMBER_DEFAULTS,handSize:15,seconds:null,penalty},0);
    const departed=new Set();
    for (let turn=1;turn<=15;turn++) {
      const now=round.startsAt;
      advanceNumberClash(round,now,departed);
      for (const id of ids) submitNumberCard(round,id,{turn,card:turn,sequence:1},now);
      advanceNumberClash(round,now,departed);
      assert.equal(round.phase,'closing');
      assert.throws(()=>submitNumberCard(round,ids[0],{turn,card:15,sequence:2},now),{code:'numberClosed'});
      advanceNumberClash(round,round.closesAt,departed);
      const reveal=numberView(round,ids[0]);
      assert.equal(reveal.phase,'reveal');
      assert.equal(reveal.table.length,turn);
      assert.equal(reveal.judgment,undefined);
      assert.equal(reveal.scores[ids[0]],penalty ? -(turn-1)*penalty || 0 : 0);
      const deadline=round.phaseUntil;
      advanceNumberClash(round,deadline,departed);
      advanceNumberClash(round,deadline,departed);
      const judgment=numberView(round,ids[1]);
      assert.equal(judgment.phase,'judgment');
      assert.equal(judgment.judgment.winner,null);
      assert.deepEqual(Object.values(judgment.scores),ids.map(()=>-(turn*penalty) || 0));
      advanceNumberClash(round,round.phaseUntil,departed);
    }
    assert.equal(round.phase,'result');
    assert.deepEqual(round.table,[]);
    assert.ok(round.players.every(({unused})=>unused.length===0));
    assert.deepEqual(numberRankings(round),ids.map(id=>({id,score:-(15*penalty) || 0,rank:1})));
  }
});

test('Number Clash ranks negative scores and uses competition ranking for ties',()=>{
  const players=[
    {id:'a',score:-1},{id:'b',score:4},{id:'c',score:-9},{id:'d',score:4},
  ];
  assert.deepEqual(numberRankings({players}).map(({id,rank})=>[id,rank]),[['b',1],['d',1],['a',3],['c',4]]);
});
