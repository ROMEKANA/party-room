import {ACTIONS,BATTLE_CHOICES,actionTargets,areEnemies,canUseAction} from '../web/battle-rules.js';
import {shuffle} from './draw.js';
import {requireGame} from './room.js';

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

export function battleSettings(current, patch, ids) {
  requireGame(patch && typeof patch === 'object' && !Array.isArray(patch),'設定が無効です。',400);
  for (const [key,value] of Object.entries(patch)) {
    const valid = key === 'bossId' ? value === null || ids.includes(value) :
      Object.hasOwn(BATTLE_CHOICES,key) && BATTLE_CHOICES[key].includes(value);
    requireGame(valid,'設定値が範囲外です。',400);
  }
  return {...current,...patch};
}

function nextTurn(round, now) {
  round.turn++;
  round.phase = 'prepare';
  round.startsAt = now + round.settings.readyMs;
  round.endsAt = round.settings.seconds === null ? null : round.startsAt + round.settings.seconds * 1000;
  round.closesAt = null;
  round.reviewUntil = null;
  round.moves = {};
  round.version++;
}

export function startBattle(ids, settings, teams, now) {
  const boss = settings.mode === 'boss' ? settings.bossId ?? shuffle(ids)[0] : null;
  const match = {
    id:crypto.randomUUID(), ids, version:0, turn:0, settings:{...settings}, boss, previous:null, outcome:null,
    players:ids.map(id => {
      const team = settings.mode === 'teams' ? (teams.pink.includes(id) ? 'pink' : 'blue') :
        settings.mode === 'boss' ? (id === boss ? 'boss' : 'party') : null;
      const maxHp = id === boss ? settings.hp * 2 : settings.hp;
      return {id,team,maxHp,hp:maxHp,energy:0,defense:0};
    }),
  };
  nextTurn(match,now);
  return match;
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
  if (round.phase === 'result') return;
  if (round.phase === 'review') {
    if (now >= round.reviewUntil) nextTurn(round,now);
    return;
  }
  if (round.phase === 'prepare') {
    if (now < round.startsAt) return;
    round.phase = 'select';
    round.version++;
  }
  if (round.phase === 'select') {
    const timedOut = round.endsAt !== null && now >= round.endsAt;
    const allReady = round.players.every(player => player.hp === 0 || Object.hasOwn(round.moves,player.id) ||
      (round.endsAt === null && departed.has(player.id)));
    if (!allReady && !timedOut) return;
    round.phase = 'closing';
    round.closesAt = (timedOut ? round.endsAt : now) + round.settings.graceMs;
    round.version++;
  }
  if (now < round.closesAt) return;
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
  const recipients = new Set();
  const gifts = new Map();
  const sweeps = living.filter(player => moves.get(player.id).kind === 'sweep');
  const canceled = sweeps.some(one => sweeps.some(other => areEnemies(one,other)));
  const outgoing = new Map();
  for (const player of living) {
    const {kind,target} = moves.get(player.id);
    if (kind === 'guard') recipients.add(player.id);
    if (kind === 'cover') recipients.add(target);
    if (kind === 'give') gifts.set(target,(gifts.get(target) ?? 0)+1);
    if (kind === 'strike') outgoing.set(player.id,[target]);
    if (kind === 'sweep') outgoing.set(player.id,living.filter(other => areEnemies(player,other)).map(other => other.id));
  }

  const hits = new Map();
  const effects = new Map();
  for (const [source,targets] of outgoing) {
    effects.set(source,targets.map(target => {
      if (canceled || outgoing.get(target)?.includes(source)) return {target,result:'cancel'};
      if (recipients.has(target)) return {target,result:'block'};
      hits.set(target,(hits.get(target) ?? 0)+1);
      return {target,result:'hit'};
    }));
  }

  const outcomes = new Map();
  const players = round.players.map(player => {
    const move = moves.get(player.id);
    if (!move) return player;
    const action = ACTIONS[move.kind];
    const hp = Math.max(0,player.hp-Math.min(hits.get(player.id) ?? 0,round.settings.hitCap ?? Infinity));
    const charged = move.kind === 'charge' ? (player.team === 'boss' ? 2 : 1) : 0;
    const energy = Math.min(round.settings.energy,player.energy-action.cost+charged+(gifts.get(player.id) ?? 0));
    const defense = action.defense ? player.defense+1 : 0;
    outcomes.set(player.id,{...move,effects:effects.get(player.id) ?? [],
      hpDelta:hp-player.hp,energyDelta:energy-player.energy,eliminated:hp === 0});
    return {...player,hp,energy,defense};
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
    players:round.players.map((player,index) => ({
      ...player,color:round.colors?.[index],
      online:roster.find(entry => entry.id === player.id)?.online ?? false,
      submitted:Object.hasOwn(round.moves,player.id),
    })),
    ownMove:current,
  };
}
