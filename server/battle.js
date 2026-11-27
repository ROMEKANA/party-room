import {ACTIONS,BATTLE_CHOICES,actionCost,actionTargets,areEnemies,canUseAction} from '../web/battle-rules.js';
import {JOBS,JOB_BATTLE_FIXED,JOB_CANDIDATE_COUNT} from '../web/battle-jobs.js';
import {shuffle} from './draw.js';
import {requireGame} from './room.js';
import {advanceTimedSelection,beginTimedTurn} from './timed-turn.js';

const pass = () => ({kind:'charge',target:null});

export function battleStartProblem(settings, players) {
  const count = players.length;
  if (settings.mode === 'boss') {
    if (count !== 4) return 'ボス戦には接続中のプレイヤーが4人必要です。';
    if (settings.bossId !== null && !players.some(player => player.id === settings.bossId)) {
      return '接続中のプレイヤーをボスに指定してください。';
    }
  }
  if (settings.mode === 'teams' && (count < 4 || count % 2 !== 0)) {
    return 'チーム戦には接続中のプレイヤーが4・6・8・10人必要です。';
  }
  return count < 2 ? '開始には接続中のプレイヤーが2人以上必要です。' : '';
}

export function battleSettings(current, patch, ids, withJobs = false) {
  requireGame(patch && typeof patch === 'object' && !Array.isArray(patch),'設定が無効です。',400);
  for (const [key,value] of Object.entries(patch)) {
    requireGame(!withJobs || (key !== 'bossId' && !Object.hasOwn(JOB_BATTLE_FIXED,key) &&
      !(key === 'mode' && value === 'boss')),'このゲームでは設定を変更できません。',400);
    const valid = key === 'bossId' ? value === null || ids.includes(value) :
      Object.hasOwn(BATTLE_CHOICES,key) && BATTLE_CHOICES[key].includes(value);
    requireGame(valid,'設定値が範囲外です。',400);
  }
  return {...current,...patch};
}

function nextTurn(round, now) {
  beginTimedTurn(round,now);
  round.reviewUntil = null;
}

export function startBattle(ids, settings, teams, now, withJobs = false) {
  const boss = settings.mode === 'boss' ? settings.bossId ?? shuffle(ids)[0] : null;
  const match = {
    id:crypto.randomUUID(), ids, version:0, turn:0, settings:{...settings}, boss, previous:null, outcome:null,
    players:ids.map(id => {
      const team = settings.mode === 'teams' ? (teams.pink.includes(id) ? 'pink' : 'blue') :
        settings.mode === 'boss' ? (id === boss ? 'boss' : 'party') : null;
      const maxHp = withJobs ? settings.maxHp : id === boss ? settings.hp * 2 : settings.hp;
      return {id,team,maxHp,hp:withJobs ? settings.hp : maxHp,energy:0,defense:0};
    }),
  };
  if (withJobs) {
    match.withJobs = true;
    match.phase = 'jobs';
    match.moves = {};
    match.jobDraft = ids.map(() => ({candidates:shuffle(Object.keys(JOBS)).slice(0,JOB_CANDIDATE_COUNT),chosen:null}));
  } else nextTurn(match,now);
  return match;
}

export function selectBattleJob(round, id, job, now) {
  requireGame(round.phase === 'jobs','職業選択は終了しました。');
  const draft = round.jobDraft[round.ids.indexOf(id)];
  requireGame(draft,'観戦中は職業を選べません。',403,'forbidden');
  requireGame(draft.chosen === null,'職業は確定済みです。');
  requireGame(draft.candidates.includes(job),'候補から職業を選んでください。',400);
  draft.chosen = job;
  round.version++;
  if (round.jobDraft.some(entry => entry.chosen === null)) return;
  for (const [index, player] of round.players.entries()) {
    player.job = round.jobDraft[index].chosen;
    const bonus = JOBS[player.job].hpBonus ?? 0;
    player.hp += bonus;
    player.maxHp += bonus;
    player.cursed = false;
  }
  delete round.jobDraft;
  nextTurn(round,now);
}

function validatedMove(round, player, move) {
  if (!move || !canUseAction(round,player,move.kind)) return null;
  const target = ACTIONS[move.kind].target;
  if (target && !actionTargets(round,player,move.kind).includes(move.target)) return null;
  return {kind:move.kind,target:target ? move.target : null};
}

export function submitBattleMove(round, playerId, request, now) {
  requireGame(round && request.turn === round.turn,'次のターンが始まりました。',409,'battleClosed');
  const {moves} = round;
  requireGame((round.phase === 'select' || round.phase === 'closing') &&
    (round.closesAt === null || now < round.closesAt),
  'このターンの受付は終了しました。',409,'battleClosed');
  const player = round.players.find(entry => entry.id === playerId);
  requireGame(player?.hp > 0,'観戦中は行動できません。',403,'forbidden');
  requireGame(Number.isSafeInteger(request.sequence) && request.sequence > 0,'行動順序が無効です。',400);
  const previous = Object.hasOwn(moves,playerId) ? moves[playerId] : null;
  if (previous && request.sequence <= previous.sequence) return;
  const move = validatedMove(round,player,{kind:request.kind,target:request.target});
  requireGame(move,'現在選べない行動です。',409,'battleInvalid');
  // A display name can also be a property name such as "__proto__".
  Object.defineProperty(moves,playerId,{value:{...move,sequence:request.sequence}, enumerable:true, configurable:true});
  round.version++;
}

export function advanceBattle(round, now, departed) {
  if (round.phase === 'result' || round.phase === 'jobs') return;
  if (round.phase === 'review') {
    if (now >= round.reviewUntil) nextTurn(round,now);
    return;
  }
  const allReady = () => round.players.every(player => player.hp === 0 || Object.hasOwn(round.moves,player.id) ||
    (round.endsAt === null && departed.has(player.id)));
  if (!advanceTimedSelection(round,now,allReady)) return;
  const resolved = resolveBattleTurn(round);
  round.players = resolved.players;
  round.previous = {turn:round.turn,actions:resolved.actions};
  round.outcome = resolved.outcome;
  round.moves = {};
  round.phase = round.outcome ? 'result' : 'review';
  round.reviewUntil = now + round.settings.resultMs;
  round.version++;
}

export function resolveBattleTurn(round) {
  const living = round.players.filter(player => player.hp > 0);
  const moves = new Map(living.map(player => [
    player.id, validatedMove(round,player,Object.hasOwn(round.moves,player.id) ? round.moves[player.id] : null) ?? pass(),
  ]));
  const guards = new Set();
  const covers = new Set();
  const gifts = new Map();
  const sweeps = living.filter(player => moves.get(player.id).kind === 'sweep');
  const canceled = sweeps.some(one => sweeps.some(other => areEnemies(one,other)));
  const outgoing = new Map();
  for (const player of living) {
    const {kind,target} = moves.get(player.id);
    if (kind === 'guard') guards.add(player.id);
    if (kind === 'cover') covers.add(target);
    if (kind === 'give') gifts.set(target,(gifts.get(target) ?? 0)+1);
    if (kind === 'strike' || kind === 'pierce') outgoing.set(player.id,[target]);
    if (kind === 'sweep') outgoing.set(player.id,living.filter(other => areEnemies(player,other)).map(other => other.id));
  }

  const hits = new Map();
  const effects = new Map();
  const guardSuccess = new Set();
  const byId = new Map(living.map(player => [player.id,player]));
  const addHit = (target,source,damage,kind) => {
    const list = hits.get(target) ?? [];
    list.push({source,damage,kind});
    hits.set(target,list);
  };
  const addEffect = (source,effect) => {
    const list = effects.get(source) ?? [];
    list.push(effect);
    effects.set(source,list);
  };
  for (const [source,targets] of outgoing) {
    const {kind} = moves.get(source);
    const job = JOBS[byId.get(source).job];
    for (const target of targets) {
      let result;
      let amount;
      if (canceled || outgoing.get(target)?.includes(source)) result = 'cancel';
      else if (guards.has(target) && kind !== 'pierce') {
        guardSuccess.add(target);
        result = 'block';
      } else if (covers.has(target)) result = 'block';
      else if (kind !== 'sweep' && moves.get(target).kind === 'counter') {
        result = 'countered';
        const damage = JOBS[byId.get(target).job].counterDamage;
        addHit(source,target,damage,'counter');
      } else {
        result = 'hit';
        amount = kind === 'pierce' ? job.pierceDamage : job?.damageMultiplier ?? 1;
        addHit(target,source,amount,kind);
      }
      addEffect(source,{target,result,...(round.withJobs && amount !== undefined ? {amount} : {})});
    }
  }

  const order = (a,b) => a < b ? -1 : a > b ? 1 : 0;
  const hitCap = round.settings.hitCap ?? Infinity;
  const damage = new Map();
  for (const [target,list] of hits) {
    if (!round.withJobs) {
      damage.set(target,Math.min(list.length,hitCap));
      continue;
    }
    list.sort((a,b) => b.damage-a.damage || order(a.source,b.source));
    const applied = list.slice(0,hitCap);
    damage.set(target,applied.reduce((sum,hit)=>sum+hit.damage,0));
    for (const hit of list) {
      if (hit.kind === 'counter') {
        addEffect(hit.source,{target,result:'counter',amount:applied.includes(hit) ? hit.damage : 0});
      } else if (!applied.includes(hit)) {
        const effect = effects.get(hit.source).find(entry=>entry.target === target);
        Object.assign(effect,{result:'capped',amount:0});
      }
    }
  }

  const heals = new Map();
  const curses = new Set();
  const remaining = new Map();
  const gains = new Map();
  const stolen = new Map();
  const cap = round.settings.energy;
  for (const player of living) {
    const {kind,target} = moves.get(player.id);
    const job = JOBS[player.job];
    remaining.set(player.id,player.energy-actionCost(player,kind));
    const charge = kind === 'charge' ? (job?.charge ?? (player.team === 'boss' ? 2 : 1)) : 0;
    const guardGain = guardSuccess.has(player.id) ? job?.guardEnergy ?? 0 : 0;
    gains.set(player.id,charge+guardGain+(gifts.get(player.id) ?? 0));
    if (guardGain) addEffect(player.id,{target:player.id,result:'guardEnergy',amount:Math.min(guardGain,cap-player.energy)});
    if (kind === 'heal') {
      heals.set(target,(heals.get(target) ?? 0)+job.healing);
    }
    if (kind === 'curse') {
      curses.add(target);
      addEffect(player.id,{target,result:'curse'});
    }
  }

  if (round.withJobs) {
    // Allocate steals from post-cost energy. Incoming gains cannot fund another steal.
    for (const source of [...byId.keys()].sort(order)) {
      const {kind,target} = moves.get(source);
      const steal = JOBS[byId.get(source).job]?.steal;
      if (!steal || kind !== 'strike' || !effects.get(source)?.some(effect=>['hit','capped'].includes(effect.result))) continue;
      const capacity = Math.max(0,cap-remaining.get(source)-gains.get(source));
      const amount = Math.min(steal,remaining.get(target),capacity);
      if (!amount) continue;
      remaining.set(target,remaining.get(target)-amount);
      stolen.set(source,amount);
      addEffect(source,{target,result:'steal',amount});
    }
    // Report only the healing that contributes to the resolved HP, in stable order.
    const effectiveHealing = new Map();
    for (const [id,amount] of heals) {
      const player = byId.get(id);
      const afterDamage = player.hp-(damage.get(id) ?? 0);
      const hp = Math.max(0,Math.min(player.maxHp,afterDamage+amount));
      effectiveHealing.set(id,hp-Math.max(0,afterDamage));
    }
    for (const source of [...byId.keys()].sort(order)) {
      const {kind,target} = moves.get(source);
      if (kind !== 'heal') continue;
      const amount = Math.min(JOBS[byId.get(source).job].healing,effectiveHealing.get(target));
      effectiveHealing.set(target,effectiveHealing.get(target)-amount);
      addEffect(source,{target,result:'heal',amount});
    }
  }

  const outcomes = new Map();
  const players = round.players.map(player => {
    const move = moves.get(player.id);
    if (!move) return player;
    const action = ACTIONS[move.kind];
    const nextHp = player.hp-(damage.get(player.id) ?? 0);
    const hp = Math.max(0,round.withJobs ? Math.min(player.maxHp,nextHp+(heals.get(player.id) ?? 0)) : nextHp);
    const energy = Math.min(cap,remaining.get(player.id)+gains.get(player.id)+(stolen.get(player.id) ?? 0));
    const defense = action.defense ? player.defense+1 : 0;
    outcomes.set(player.id,{...move,effects:effects.get(player.id) ?? [],
      hpDelta:hp-player.hp,energyDelta:energy-player.energy,eliminated:hp === 0});
    return {...player,hp,energy,defense,...(round.withJobs ? {cursed:curses.has(player.id)} : {})};
  });
  const survivors = players.filter(player => player.hp > 0);
  const sides = new Set(survivors.map(player => player.team ?? player.id));
  const outcome = sides.size === 0 ? {draw:true} :
    sides.size === 1 ? {draw:false,winner:survivors[0].team === null ? survivors[0].id : null,team:survivors[0].team} : null;
  return {players,actions:Object.fromEntries(outcomes),outcome};
}

export function battleView(round, id, roster = []) {
  const {id:match,version,turn,phase,settings,boss,previous,outcome,startsAt,endsAt,reviewUntil} = round;
  const current = id !== null && Object.hasOwn(round.moves,id) ? round.moves[id] : null;
  return {
    id:match,version,turn,phase,settings,boss,previous,outcome,startsAt,endsAt,reviewUntil,
    ...(round.withJobs ? {withJobs:true} : {}),
    ...(phase === 'jobs' ? {
      jobDraft:round.jobDraft[round.ids.indexOf(id)] ?? null,
      jobsReady:round.jobDraft.filter(entry=>entry.chosen !== null).length,
    } : {}),
    players:round.players.map((player,index) => {
      const display = roster[index];
      return {...player,color:round.colors?.[index],avatarId:display?.avatarId,
        online:display?.online ?? false,submitted:Object.hasOwn(round.moves,player.id)};
    }),
    ownMove:current,
  };
}
