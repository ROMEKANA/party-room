import test from 'node:test';
import assert from 'node:assert/strict';
import {battleView,selectBattleJob,resolveBattleTurn,startBattle} from '../server/battle.js';
import {BATTLE_DEFAULTS,actionTargets,canUseAction} from '../web/battle-rules.js';
import {JOBS,JOB_BATTLE_FIXED,JOB_CANDIDATE_COUNT} from '../web/battle-jobs.js';

const ids = ['a','b','c','d','e','f'];
const teams = {pink:['a','b','c'],blue:['d','e','f']};
function start(mode = 'royale',settings = {},players = ids) {
  return startBattle(players,{...BATTLE_DEFAULTS,...JOB_BATTLE_FIXED,mode,...settings},teams,100,true);
}
function round(mode,stats,settings) {
  const match = start(mode,settings);
  for (const [index,id] of ids.entries()) {
    const job = stats[id]?.job ?? 'heavy';
    match.jobDraft[index].candidates = [job];
    selectBattleJob(match,id,job,100);
  }
  for (const p of match.players) Object.assign(p,{energy:3},stats[p.id]);
  return match;
}
function resolve(match,actions) {
  const moves = Object.fromEntries(Object.entries(actions).map(([id,[kind,target]])=>[id,{kind,target}]));
  return resolveBattleTurn({...match,moves});
}
const player = (match,id) => match.players.find(p=>p.id === id);
const stats = (match,id) => {
  const {hp,energy} = player(match,id);
  return [hp,energy];
};

test('drafts are independent, sampled without replacement, private and fixed until simultaneous reveal',()=>{
  assert.equal(Object.keys(JOBS).length,10);
  const match = start();
  for (const {candidates} of match.jobDraft) {
    assert.equal(candidates.length,JOB_CANDIDATE_COUNT);
    assert.equal(new Set(candidates).size,candidates.length);
    assert.ok(candidates.every(job=>Object.hasOwn(JOBS,job)));
  }
  assert.notStrictEqual(match.jobDraft[0].candidates,match.jobDraft[1].candidates);
  assert.equal(battleView(match,'watcher').jobDraft,null);
  const [a,b] = match.jobDraft;
  b.candidates = [...a.candidates];
  const chosen = a.candidates[0];
  assert.throws(()=>selectBattleJob(match,'a','invalid',100));
  assert.throws(()=>selectBattleJob(match,'watcher',chosen,100));
  selectBattleJob(match,'a',chosen,100);
  assert.throws(()=>selectBattleJob(match,'a',chosen,100));
  assert.equal(battleView(match,'b').jobDraft.chosen,null);
  assert.ok(battleView(match,'b').players.every(p=>p.job === undefined));
  for (const [i,id] of ids.entries()) {
    if (i) selectBattleJob(match,id,match.jobDraft[i].candidates[0],500);
  }
  assert.equal(match.phase,'prepare');
  assert.equal(match.turn,1);
  assert.equal(match.startsAt,500+BATTLE_DEFAULTS.readyMs);
  assert.equal(player(match,'a').job,player(match,'b').job);
  assert.equal(battleView(match,null).jobDraft,undefined);
  assert.equal(battleView(match,null).players[0].job,chosen);
});

test('warrior damage takes precedence over lesser and equal hits, and heavy and counter HP apply',()=>{
  const match = round('teams',{a:{job:'warrior'},b:{job:'warrior'},c:{job:'swordsman'}});
  assert.deepEqual(match.players.map(p=>p.maxHp),[3,3,2,5,5,5]);
  const actions = {a:['strike','d'],b:['strike','d'],c:['strike','d']};
  let result = resolve(match,actions);
  assert.equal(player(result,'d').hp,3);
  assert.deepEqual([result.actions.a.effects[0].result,result.actions.b.effects[0].result],['hit','capped']);
  const reordered = resolve({...match,players:[...match.players].reverse()},actions);
  assert.deepEqual(result.players,[...reordered.players].reverse());
  assert.deepEqual(result.actions,reordered.actions);
  result = resolve(match,{a:['sweep'],b:['strike','d'],c:['strike','d'],e:['guard']});
  assert.deepEqual(['d','e','f'].map(id=>player(result,id).hp),[3,5,3]);
  assert.equal(resolve({...match,settings:{...match.settings,hitCap:null}},actions).players[3].hp,0);
});

test('cleric targets living allies or self and healing combines with damage before HP bounds',()=>{
  const match = round('teams',{a:{job:'cleric',hp:1},b:{hp:0},c:{hp:1,maxHp:1}});
  assert.deepEqual(actionTargets(match,player(match,'a'),'heal'),['a','c']);
  const together = resolve(match,{a:['heal','c'],d:['strike','c']});
  assert.equal(player(together,'c').hp,1);
  assert.equal(together.actions.a.effects[0].amount,1);
  const full = resolve(match,{a:['heal','c']});
  assert.equal(full.actions.a.effects[0].amount,0);
  assert.equal(player(full,'b').hp,0);
  assert.equal(resolve(match,{a:['heal','b']}).actions.a.kind,'charge');
  const royale = round('royale',{a:{job:'cleric'}});
  assert.deepEqual(actionTargets(royale,player(royale,'a'),'heal'),['a']);
});

test('counter costs energy whether it fires or not, counters pierce, and takes sweep damage',()=>{
  const match = round('teams',{a:{job:'swordsman'},d:{job:'assassin'}});
  const result = resolve(match,{a:['counter'],d:['pierce','a'],e:['strike','a'],f:['sweep']});
  assert.deepEqual(stats(result,'a'),[1,2]);
  assert.deepEqual(stats(result,'d'),[2,1]);
  assert.equal(player(result,'e').hp,4);
  assert.equal(result.actions.d.effects[0].result,'countered');
  assert.equal(result.actions.a.effects.filter(e=>e.result === 'counter').length,2);
  assert.deepEqual(stats(resolve(match,{a:['counter']}),'a'),[2,2]);
  assert.equal(player(result,'a').defense,1);
  assert.equal(canUseAction(match,{...player(match,'a'),defense:3},'counter'),false);
  assert.equal(canUseAction(match,{...player(match,'a'),energy:0},'counter'),false);
});

test('mage and fighter modify energy costs and charging without breaking the cap',()=>{
  const match = round('teams',{a:{job:'mage',energy:2},b:{job:'fighter',energy:0},c:{job:'fighter',energy:2}});
  const result = resolve(match,{a:['sweep']});
  assert.deepEqual(['a','b','c'].map(id=>player(result,id).energy),[0,2,3]);
  assert.ok(['d','e','f'].every(id=>player(result,id).hp === 4));
});

test('pierce goes through guard but not cover or a reciprocal strike, and knights gain once',()=>{
  const match = round('teams',{a:{job:'knight',energy:1},d:{job:'assassin'}});
  const guarded = resolve(match,{a:['guard'],d:['pierce','a'],e:['strike','a'],f:['strike','a']});
  assert.deepEqual(stats(guarded,'a'),[2,2]);
  assert.equal(guarded.actions.a.effects.length,1);
  assert.deepEqual(stats(resolve(match,{a:['guard'],d:['pierce','a']}),'a'),[2,1]);
  assert.deepEqual(stats(resolve(match,{a:['guard']}),'a'),[3,1]);
  assert.equal(resolve(match,{b:['cover','a'],d:['pierce','a']}).actions.d.effects[0].result,'block');
  assert.equal(resolve(match,{a:['strike','d'],d:['pierce','a']}).actions.d.effects[0].result,'cancel');
});

test('thief moves post-cost energy, cannot cancel a submitted move, and cannot steal blocked hits or future gains',()=>{
  const match = round('teams',{a:{job:'thief',energy:1},b:{job:'thief',energy:1},d:{energy:2}});
  let result = resolve(match,{a:['strike','d'],b:['strike','d'],d:['strike','c']});
  assert.deepEqual(['a','b','d'].map(id=>player(result,id).energy),[1,0,0]);
  assert.equal(player(result,'c').hp,4);
  result = resolve(match,{a:['strike','d'],d:['guard']});
  assert.equal(player(result,'a').energy,0);
  const empty = round('royale',{a:{job:'thief'},b:{energy:0}});
  result = resolve(empty,{a:['strike','b']});
  assert.deepEqual([player(result,'a').energy,player(result,'b').energy],[2,1]);
  assert.equal(resolve(empty,{a:['sweep']}).actions.a.effects.some(e=>e.result === 'steal'),false);
});

test('curse restricts only normal guard for one turn and does not damage the target',()=>{
  const match = round('teams',{a:{job:'witch'},d:{job:'swordsman'}});
  const first = resolve(match,{a:['curse','d'],d:['guard']});
  assert.deepEqual(stats(first,'d'),[2,3]);
  assert.equal(first.actions.d.kind,'guard');
  const next = {...match,players:first.players};
  assert.equal(canUseAction(next,player(next,'d'),'guard'),false);
  assert.equal(canUseAction(next,player(next,'d'),'counter'),true);
  assert.equal(canUseAction(next,player(next,'d'),'cover'),true);
  const second = resolve(next,{d:['counter']});
  assert.equal(player(second,'d').cursed,false);
  assert.equal(canUseAction({...next,players:second.players},player(second,'d'),'guard'),true);
});

test('last living player or team wins, and simultaneous elimination draws',()=>{
  const royale = round('royale',{a:{job:'warrior'},b:{hp:2},c:{hp:0},d:{hp:0},e:{hp:0},f:{hp:0}});
  assert.equal(resolve(royale,{a:['strike','b']}).outcome.winner,'a');
  const team = round('teams',{a:{job:'warrior'},d:{hp:2},e:{hp:2},f:{hp:2}});
  assert.equal(resolve(team,{a:['sweep']}).outcome.team,'pink');
  const draw = round('royale',{a:{hp:1},b:{hp:1},c:{hp:1},d:{hp:0},e:{hp:0},f:{hp:0}});
  assert.deepEqual(resolve(draw,{a:['strike','b'],b:['strike','c'],c:['strike','a']}).outcome,{draw:true});
});
