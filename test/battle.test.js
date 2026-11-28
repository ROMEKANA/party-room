import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveBattleTurn,startBattle} from '../server/battle.js';
import {availableActions,canUseAction,BATTLE_DEFAULTS} from '../web/battle-rules.js';

const teams = {pink:['a','b','c'],blue:['d','e','f']};
function match(mode = 'teams',settings = {},stats = {}) {
  const ids = mode === 'boss' ? ['a','b','c','d'] : ['a','b','c','d','e','f'];
  const r = startBattle(ids,{...BATTLE_DEFAULTS,mode,...settings},teams,0);
  r.players = r.players.map(p=>({...p,energy:r.settings.energy,...stats[p.id]}));
  return r;
}
function resolve(r,actions) {
  const moves = Object.fromEntries(Object.entries(actions).map(([id,[kind,target]])=>[id,{kind,target}]));
  return resolveBattleTurn({...r,moves});
}
const player = (result,id) => result.players.find(p=>p.id === id);

test('reciprocal strikes and a strike into a sweep cancel just the pair and still cost energy',()=>{
  const r = match();
  for (const kind of ['strike','sweep']) {
    const result = resolve(r,{a:['strike','d'],d:[kind,'a'],e:['strike','a']});
    assert.equal(player(result,'a').hp,2);
    assert.equal(player(result,'d').hp,3);
    assert.equal(player(result,'a').energy,2);
    assert.equal(player(result,'d').energy,kind === 'sweep' ? 0 : 2);
    assert.equal(player(result,'b').hp,kind === 'sweep' ? 2 : 3);
    assert.ok(result.actions.a.effects.some(e=>e.target === 'd' && e.result === 'cancel'));
  }
  const unrelated = resolve(r,{a:['strike','e'],d:['sweep']});
  assert.equal(player(unrelated,'a').hp,2);
  assert.equal(player(unrelated,'e').hp,2);
});

test('hostile sweeps cancel every attack, allied sweeps stack and non-attacks still resolve',()=>{
  const r = match('teams',{hitCap:null},{c:{energy:2},f:{energy:0}});
  const all = resolve(r,{a:['sweep'],d:['sweep'],b:['strike','e'],c:['give','b']});
  assert.ok(all.players.every(p=>p.hp === 3));
  assert.deepEqual([player(all,'a').energy,player(all,'d').energy,player(all,'b').energy,
    player(all,'c').energy,player(all,'f').energy],[0,0,3,1,1]);
  assert.equal(all.actions.b.effects[0].result,'cancel');
  const allies = resolve(r,{a:['sweep'],b:['sweep']});
  assert.equal(player(allies,'d').hp,1);
  assert.equal(player(allies,'a').hp,3);
});

test('cover and guard protect their designated players against all hits, including mutual and repeated cover',()=>{
  const r = match('teams',{hitCap:null});
  const result = resolve(r,{a:['cover','b'],b:['cover','a'],c:['cover','b'],d:['sweep'],e:['strike','b']});
  assert.deepEqual(result.players.slice(0,3).map(p=>[p.hp,p.defense]),[[3,1],[3,1],[2,1]]);
  assert.deepEqual(result.actions.d.effects.map(e=>e.result),['block','block','hit']);
  const guarded = resolve(r,{a:['guard'],d:['sweep'],e:['strike','a']});
  assert.equal(player(guarded,'a').hp,3);
  assert.equal(player(guarded,'b').hp,2);
  const guardedAlly = resolve(r,{a:['cover','b'],d:['sweep'],e:['strike','a']});
  assert.equal(player(guardedAlly,'a').hp,1);
  assert.equal(player(guardedAlly,'b').hp,3);
});

test('hit cap selects attacks by source on equal damage and a player eliminated this turn still acts',()=>{
  const actions = {a:['strike','f'],d:['strike','a'],e:['strike','a'],f:['strike','b']};
  for (const [hitCap,hp] of [[1,1],[2,0],[null,0]]) {
    const result = resolve(match('teams',{hitCap},{a:{hp:2},f:{hp:1}}),actions);
    assert.equal(player(result,'a').hp,hp);
    assert.equal(player(result,'f').hp,0);
    assert.equal(player(result,'b').hp,2);
    assert.equal(result.actions.f.eliminated,true);
    assert.equal(result.actions.d.effects[0].result,'hit');
    assert.equal(result.actions.e.effects[0].result,hitCap === 1 ? 'capped' : 'hit');
  }
  const royale = resolve(match('royale'),{d:['strike','a'],e:['strike','a']});
  assert.equal(player(royale,'a').hp,2);
  assert.deepEqual(royale.actions.e.effects,[{target:'a',result:'capped',amount:0}]);
  const draw = resolve(match('royale',{hp:1},{d:{hp:0},e:{hp:0},f:{hp:0}}),
    {a:['strike','b'],b:['strike','c'],c:['strike','a']});
  assert.deepEqual(draw.outcome,{draw:true});
});

test('defense limit is shared, energy and targets use start-of-turn state, and gifts are capped after costs',()=>{
  const r = match('teams',{}, {a:{defense:3},b:{energy:0},c:{hp:0}});
  const a = r.players[0];
  assert.equal(canUseAction(r,a,'cover'),false);
  assert.equal(canUseAction(r,a,'guard'),false);
  const result = resolve(r,{a:['give','b'],b:['strike','d'],d:['give','f'],e:['give','f'],f:['strike','a']});
  assert.equal(player(result,'a').defense,0);
  assert.equal(result.actions.b.kind,'charge');
  assert.equal(player(result,'b').energy,2);
  assert.equal(player(result,'f').energy,3);
  assert.equal(player(result,'d').hp,3);
  assert.equal(canUseAction({...r,settings:{...r.settings,defenseLimit:null}},a,'guard'),true);
  const invalid = resolve(r,{a:['give','c'],b:['strike','a']});
  assert.equal(invalid.actions.a.kind,'charge');
  assert.equal(invalid.actions.b.kind,'charge');
});

test('boss and team actions use asymmetric rules, and player order does not change stats or outcomes',()=>{
  const r = match('boss',{bossId:'b',energy:4},{b:{energy:0},a:{energy:0}});
  const boss = r.players.find(p=>p.id === r.boss);
  assert.deepEqual([boss.hp,boss.maxHp],[9,9]);
  assert.deepEqual(availableActions(r,boss),['charge','guard','strike','sweep']);
  assert.deepEqual(availableActions(r,r.players[0]),['charge','guard','strike','cover','give']);
  const actions = {a:['sweep'],b:['charge'],c:['strike','b'],d:['cover','a']};
  const result = resolve(r,actions);
  assert.equal(player(result,'b').energy,2);
  assert.equal(player(result,'a').energy,1);
  assert.equal(player(result,'b').hp,8);
  const reverse = resolve({...r,players:[...r.players].reverse()},actions);
  assert.deepEqual(result.players,[...reverse.players].reverse());
  assert.deepEqual(result.actions,reverse.actions);
  assert.deepEqual(result.outcome,reverse.outcome);
  const duel = startBattle(['a','b'],BATTLE_DEFAULTS,{},0);
  assert.deepEqual(availableActions(duel,duel.players[0]),['charge','guard','strike']);
  const lowEnergy = match('teams',{energy:2});
  assert.ok(!availableActions(lowEnergy,lowEnergy.players[0]).includes('sweep'));
});

test('boss attacks cost one, apply the shared cap and cancel only against the chosen enemy',()=>{
  for (const energy of [1,2]) {
    const r = match('boss',{bossId:'a',hp:4,energy},{a:{energy:1}});
    const boss = r.players[0];
    assert.deepEqual([boss.hp,boss.maxHp],[12,12]);
    assert.equal(canUseAction(r,boss,'sweep'),true);
    assert.equal(canUseAction(r,r.players[1],'sweep'),false);
    const strike = resolve(r,{a:['strike','b']});
    assert.equal(player(strike,'a').energy,0);
    assert.equal(player(strike,'b').hp,2);
    assert.deepEqual(strike.actions.a.effects,[{target:'b',result:'hit',amount:2}]);
    const sweep = resolve(r,{a:['sweep'],c:['guard']});
    assert.equal(player(sweep,'a').energy,0);
    assert.deepEqual(sweep.players.slice(1).map(p=>p.hp),[3,4,3]);
    const exchange = resolve(r,{a:['strike','b'],b:['strike','a'],c:['strike','a'],d:['strike','a']});
    assert.deepEqual(exchange.players.map(p=>p.hp),[11,4,4,4]);
    assert.deepEqual(['a','b','c','d'].map(id=>exchange.actions[id].effects[0].result),['cancel','cancel','hit','capped']);
    assert.equal(player(resolve(r,{}),'a').energy,energy);
  }
});
