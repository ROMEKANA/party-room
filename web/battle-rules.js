import {JOB_ACTIONS,JOBS} from './battle-jobs.js';

export const BATTLE_MODES = {royale:'バトルロイヤル', teams:'チーム戦', boss:'ボス戦'};
export const TEAM_NAMES = {pink:'ピンクチーム', blue:'水色チーム', boss:'ボス', party:'チーム側'};
export const BATTLE_CHOICES = {
  mode:Object.keys(BATTLE_MODES),
  hp:[1,2,3,4,5],
  energy:[1,2,3,4,5],
  hitCap:[1,2,3,4,5,null],
  defenseLimit:[1,2,3,4,5,null],
  seconds:[1,3,5,10,15,20,30,45,60,null],
  readyMs:[500,750,1000,1250,1500,1750,2000,2250,2500,2750,3000],
  graceMs:[400,600,800,1000,1200,1400,1600,1800,2000],
  resultMs:[750,1000,1250,1500,1750,2000,2250,2500,2750,3000],
};
export const BATTLE_DEFAULTS = {
  mode:'royale', hp:3, energy:3, hitCap:1, defenseLimit:3, seconds:10,
  readyMs:1000, graceMs:800, resultMs:1500, bossId:null,
};
export const BOSS_STATS = {hpMultiplier:3,charge:2,strikeDamage:2,sweepCost:1};
export const ACTIONS = {
  charge:{name:'溜める', icon:'⚡', cost:0},
  guard:{name:'ガード', icon:'🛡', cost:0, defense:true},
  strike:{name:'単体攻撃', icon:'⚔', cost:1, target:'enemy'},
  sweep:{name:'全体攻撃', icon:'💥', cost:3},
  cover:{name:'かばう', icon:'🤝', cost:0, target:'ally', defense:true},
  give:{name:'渡す', icon:'➕', cost:1, target:'ally'},
  ...JOB_ACTIONS,
};

export const areEnemies = (one, other) => one.id !== other.id && (one.team === null || one.team !== other.team);

export const energyLimit = (settings,player) => JOBS[player.job]?.maxEnergy ?? settings.energy;

export function actionCost(player,kind) {
  if (kind === 'sweep') {
    if (player.team === 'boss') return BOSS_STATS.sweepCost;
    return JOBS[player.job]?.sweepCost ?? ACTIONS.sweep.cost;
  }
  return ACTIONS[kind].cost;
}

export function attackDamage(player,kind) {
  if (kind === 'pierce') return JOBS[player.job].pierceDamage;
  if (kind === 'strike') {
    return player.team === 'boss' ? BOSS_STATS.strikeDamage : JOBS[player.job]?.strikeDamage ?? 1;
  }
  return 1;
}

export function availableActions(round, player) {
  const keys = ['charge','guard','strike'];
  const enemyCount = round.players.filter(other => areEnemies(player,other)).length;
  if (enemyCount > 1 && !JOBS[player.job]?.noSweep &&
    energyLimit(round.settings,player) >= actionCost(player,'sweep')) keys.push('sweep');
  if (['pink','blue','party'].includes(player.team)) keys.push('cover','give');
  const jobAction = JOBS[player.job]?.action;
  if (jobAction) keys.push(jobAction);
  return keys;
}

export function actionTargets(round, player, kind) {
  const targetType = ACTIONS[kind]?.target;
  if (!targetType) return [];
  if (targetType === 'friendly') {
    return round.players.filter(other => other.hp > 0 && (other.id === player.id || !areEnemies(player,other))).map(other => other.id);
  }
  return round.players.filter(other => other.hp > 0 && other.id !== player.id &&
    areEnemies(player,other) === (targetType === 'enemy')).map(other => other.id);
}

export function canUseAction(round, player, kind) {
  return player.hp > 0 && availableActions(round,player).includes(kind) &&
    Math.min(player.energy,energyLimit(round.settings,player)) >= actionCost(player,kind) &&
    (kind !== 'guard' || !player.cursed) &&
    (!ACTIONS[kind].defense || round.settings.defenseLimit === null || player.defense < round.settings.defenseLimit) &&
    (!ACTIONS[kind].target || actionTargets(round,player,kind).length > 0);
}
