import {resolveAvatarId} from '../web/player-profile.js';
import {alignRoles, balanceTeams, battleRoster, battleStorage, connected, gameMembers, isOnline, leave, members, moveRolesFirst, playing, requireGame, settingsFor} from './room.js';
import {start, topicAction} from './round.js';
import {mode1} from './mode1.js';
import {consensus} from './consensus.js';
import {mode23} from './mode23.js';
import {act as circleAction,startCircle} from './circle.js';
import {shuffle} from './draw.js';
import {hasParent,startProblem} from '../web/config.js';
import {JOB_BATTLE,isBattle,CIRCLE,FOUR,NUMBER_CLASH,TIER,GAMES,HISTORY_MINUTES} from '../web/games.js';
import {battleSettings,battleStartProblem,startBattle,submitBattleMove,selectBattleJob} from './battle.js';
import {numberSettings,startNumberClash,submitNumberCard} from './number-clash.js';
import {NUMBER_DEFAULTS} from '../web/number-clash-rules.js';
import {fourSettings,startFour,submitFour} from './four.js';
import {FOUR_DEFAULTS} from '../web/four-rules.js';
import {VERSION,newerVersion} from '../web/version.js';

const readyPlayers = (s,now) => gameMembers(s).filter(p => isOnline(p,now));

function gameStartProblem(s, players) {
  if (s.game === TIER) return startProblem(s.settings,players.length);
  if (isBattle(s.game)) return battleStartProblem(battleRoster(s).settings,players);
  const min = GAMES[s.game]?.min;
  return players.length < min ? `開始には接続中のプレイヤーが${min}人以上必要です。` : '';
}

export const currentStartProblem = (s,now) => gameStartProblem(s,readyPlayers(s,now));

function changeScreen(s,game) {
  s.game = game;
  s.scope = crypto.randomUUID();
  s.legacyRound = null;
  s.round = null;
  s.players = members(s);
  alignRoles(s);
}

export function checkScope(s,a) {
  const legacy = a.scope === undefined && (s.legacyRound && a.round === s.legacyRound || s.scope === null);
  requireGame(legacy || (a.scope === s.scope && a.game === s.game),
    '画面が切り替わりました。最新の画面で操作してください。',409,'stale');
}

export function action(s, p, a, now, clientVersion) {
  const r = s.round;
  const host = s.host === p.id;
  checkScope(s,a);
  if (a.type === 'leave') return leave(s,p,now);
  if (!playing(s) && (clientVersion ? newerVersion(VERSION,clientVersion) : a.scope === undefined)) {
    requireGame(false,'アプリを更新してください。',409,'updateRequired');
  }
  if (a.type === 'transfer' || a.type === 'kick') {
    const target = connected(s,now).find(person => person.id === a.player && person !== p);
    requireGame(host && target && (a.type === 'transfer' || !r), 'この参加者に対する操作はできません。');
    if (a.type === 'transfer') s.host = target.id;
    else leave(s,target,now);
    return;
  }
  if (a.type === 'commonSettings') {
    requireGame(host,'共通設定を変更できるのはホストです。');
    requireGame(HISTORY_MINUTES.includes(a.minutes),'履歴の保存期間が無効です。',400);
    s.common.historyMinutes = a.minutes;
    return;
  }
  if (a.type === 'shuffle') {
    requireGame(host && !r,'プレイヤー順を変更できるのは開始前のホストです。');
    const {mode,nominatedSetter:setter,nominatedParent:parent} = s.settings;
    const previous = s.players;
    s.players = s.game === TIER && hasParent(mode) && setter !== null && parent !== null
      ? shuffle(moveRolesFirst(s.players,setter,parent),0,1)
      : shuffle(s.players);
    if (s.fourSettings && previous.some((entry,index)=>entry !== s.players[index])) delete s.fourSettings.starter;
    return;
  }
  if (a.type === 'browse' || a.type === 'choose') {
    requireGame(host && !s.game && !r,'ゲームを選択できるのはロビーのホストです。');
    requireGame(Object.hasOwn(GAMES,a.choice),'ゲームが見つかりません。',400);
    if (a.type === 'browse') s.selectedGame = a.choice;
    else {
      requireGame(a.choice === s.selectedGame,'選択中のゲームが変わりました。');
      changeScreen(s,a.choice);
    }
    return;
  }
  if (isBattle(s.game) && a.type === 'battleMove') {
    requireGame(r?.id === a.round,'対戦が切り替わりました。',409,'battleClosed');
    submitBattleMove(r,p.id,a,now);
    return;
  }
  if (s.game === JOB_BATTLE && a.type === 'battleJob') {
    requireGame(r?.id === a.round,'対戦が切り替わりました。',409,'battleClosed');
    selectBattleJob(r,p.id,a.job,now);
    return;
  }
  if (s.game === FOUR && a.type === 'fourColumn') {
    requireGame(r?.id === a.round,'対戦が切り替わりました。',409,'fourClosed');
    submitFour(r,p.id,a);
    return;
  }
  if (s.game === NUMBER_CLASH && a.type === 'numberCard') {
    requireGame(r && r.id === a.round,'対戦が切り替わりました。',409,'numberClosed');
    submitNumberCard(r,p.id,a,now);
    return;
  }
  requireGame((r?.id ?? null) === a.round && (r?.version ?? 0) === a.version,
    'ゲームが進みました。最新の画面で操作してください。',409,'stale');
  if (a.type === 'lobby' || a.type === 'backSettings' || a.type === 'end') {
    requireGame(host && s.game && (a.type === 'lobby' || r) &&
      (a.type !== 'backSettings' || !playing(s)), '画面を移動できるのはホストです。');
    changeScreen(s,a.type === 'lobby' && a.scope !== undefined ? null : s.game);
  } else if (a.type === 'settings') {
    requireGame(host && (s.game === TIER || isBattle(s.game) || s.game === NUMBER_CLASH || s.game === FOUR) && !playing(s),
      '設定変更は開始前か結果画面のホストのみです。');
    if (isBattle(s.game)) {
      s[battleStorage(s.game).settings] = battleSettings(battleRoster(s).settings,a.settings,gameMembers(s).slice(0,4).map(p => p.id),s.game === JOB_BATTLE);
    } else if (s.game === NUMBER_CLASH) {
      s.numberSettings = numberSettings({...NUMBER_DEFAULTS,...s.numberSettings},a.settings);
    } else if (s.game === FOUR) {
      s.fourSettings = fourSettings({...FOUR_DEFAULTS,...s.fourSettings},a.settings,gameMembers(s).map(p=>p.id));
    } else {
      s.settings = settingsFor(s,a.settings);
      alignRoles(s);
    }
  } else if (a.type === 'battleSwap' || a.type === 'battleRandom') {
    const {settings,teams} = battleRoster(s);
    requireGame(host && isBattle(s.game) && settings.mode === 'teams' && !r,'開始前にホストがチームを変更できます。');
    if (a.type === 'battleRandom') s[battleStorage(s.game).teams] = balanceTeams(shuffle(gameMembers(s).map(p => p.id)));
    else {
      const pink = teams.pink.indexOf(a.pink);
      const blue = teams.blue.indexOf(a.blue);
      requireGame(pink >= 0 && blue >= 0,'異なるチームから1人ずつ選んでください。');
      teams.pink[pink] = a.blue;
      teams.blue[blue] = a.pink;
      s[battleStorage(s.game).teams] = teams;
    }
  } else if (a.type === 'start') {
    requireGame(host && s.game && !playing(s), '開始できるのは待機中か結果画面のホストです。');
    const players = readyPlayers(s,now);
    const issue = gameStartProblem(s,players);
    requireGame(!issue,issue);
    const ids = players.map(p => p.id);
    s.players = members(s);
    if (s.game === CIRCLE) s.round = startCircle(ids,s.host);
    else if (isBattle(s.game)) {
      const {settings,teams} = battleRoster(s);
      s.round = startBattle(ids,settings,balanceTeams(ids,teams),now,s.game === JOB_BATTLE);
    } else if (s.game === NUMBER_CLASH) {
      s.round = startNumberClash(ids,{...NUMBER_DEFAULTS,...s.numberSettings},now);
    } else if (s.game === FOUR) {
      s.round = startFour(ids,{...FOUR_DEFAULTS,...s.fourSettings},now);
    } else start(s,ids);
    s.round.colors = players.map(p => p.color);
    s.round.avatarIds = players.map(p => resolveAvatarId(p.avatarId,p.color));
    s.scope = s.round.id;
    s.legacyRound = null;
  } else if (s.game === CIRCLE) {
    requireGame(r && r.phase !== 'finished','次の対戦をお待ちください。');
    requireGame(r.ids.includes(p.id) || (host && a.type === 'next'), '観戦中はこの操作ができません。');
    r.host = s.host;
    requireGame(['place','bid','pass','reveal','lose','next'].includes(a.type),'不明な操作です。',400);
    actCircle(r,p.id,a);
  } else if (isBattle(s.game) || s.game === NUMBER_CLASH || s.game === FOUR) {
    requireGame(false,'不明な操作です。',400);
  } else {
    requireGame(r && (r.ids.includes(p.id) || (host && a.type === 'next')), '次のラウンドをお待ちください。');
    if (a.type === 'reroll' || a.type === 'topic') topicAction(r,p.id,a);
    else if (r.mode === 1) mode1(r,p.id,a,host);
    else if (r.mode === 4) consensus(r,p.id,a);
    else mode23(s,r,p.id,a,host,now);
  }
}

function actCircle(round,id,action) {
  if (action.type === 'reveal') {
    requireGame(Number.isInteger(action.target) && round.players[action.target],'プレイヤーを選んでください。',400);
    action = {...action,target:round.players[action.target].id};
  }
  circleAction(round,id,action);
  round.version++;
}
