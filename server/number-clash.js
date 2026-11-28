import {NUMBER_CHOICES,handCards,pointCards} from '../web/number-clash-rules.js';
import {shuffle} from './draw.js';
import {requireGame} from './room.js';
import {acceptsTimedMove,advanceTimedSelection,allTimedPlayersReady,beginTimedTurn,recordTimedMove,turnGrace} from './timed-turn.js';

export function numberSettings(current, patch) {
  requireGame(patch && typeof patch === 'object' && !Array.isArray(patch),'設定が無効です。',400);
  for (const [key,value] of Object.entries(patch)) {
    requireGame(Object.hasOwn(NUMBER_CHOICES,key) && NUMBER_CHOICES[key].includes(value),'設定値が範囲外です。',400);
  }
  return {...current,...patch};
}

function nextTurn(round, now) {
  beginTimedTurn(round,now);
  round.table.push(round.deck.shift());
  round.revealed = null;
  round.judgment = null;
  round.phaseUntil = null;
}

export function startNumberClash(ids, settings, now, timing) {
  const round = {
    id:crypto.randomUUID(), ids, version:0, turn:0, settings:{...settings}, timing:turnGrace(timing),
    players:ids.map(id=>({id,score:0,unused:handCards(settings.handSize)})),
    deck:shuffle(pointCards(settings.handSize)), table:[],
  };
  nextTurn(round,now);
  return round;
}

export function submitNumberCard(round, id, request, now) {
  requireGame(acceptsTimedMove(round,request.turn,now),'このターンの受付は終了しました。',409,'numberClosed');
  const player = round.players.find(entry=>entry.id===id);
  requireGame(player,'観戦中はカードを選べません。',403,'forbidden');
  recordTimedMove(round,id,request.sequence,()=>{
    requireGame(player.unused.includes(request.card),'使用できる手札を選んでください。',400,'numberInvalid');
    return {card:request.card};
  });
}

export function judgeNumberClash(revealed, table, settings) {
  const counts = new Map();
  for (const {card} of revealed) counts.set(card,(counts.get(card) ?? 0)+1);
  const duplicates = revealed.filter(({card})=>counts.get(card)>1).map(({id})=>id);
  const total = table.reduce((sum,value)=>sum+value,0);
  const candidates = settings.carryExtreme ? revealed : revealed.filter(({card})=>counts.get(card)===1);
  const values = candidates.map(({card})=>card);
  const extreme = total < 0 ? Math.min(...values) : Math.max(...values);
  const winner = counts.get(extreme) === 1 ? candidates.find(({card})=>card===extreme).id : null;
  return {winner,duplicates,total};
}

export function advanceNumberClash(round, now, departed) {
  if (round.phase === 'result') return;
  if (round.phase === 'judgment') {
    if (now < round.phaseUntil) return;
    if (round.turn === round.settings.handSize) {
      round.phase = 'result';
      round.table = [];
      round.moves = {};
      round.revealed = round.judgment = round.phaseUntil = null;
      round.version++;
    } else {
      if (round.judgment.winner !== null) round.table = [];
      nextTurn(round,now);
    }
    return;
  }
  if (round.phase === 'reveal') {
    if (now < round.phaseUntil) return;
    const judgment = judgeNumberClash(round.revealed,round.table,round.settings);
    const penalized = new Set(judgment.duplicates);
    for (const player of round.players) {
      if (penalized.has(player.id)) player.score -= round.settings.penalty;
      if (judgment.winner === player.id) player.score += judgment.total;
    }
    round.judgment = judgment;
    round.phase = 'judgment';
    round.phaseUntil = now + round.settings.judgmentMs;
    round.version++;
    return;
  }
  if (!advanceTimedSelection(round,now,()=>allTimedPlayersReady(round,departed),true)) return;
  round.revealed = round.players.map(player=>{
    const card = Object.hasOwn(round.moves,player.id) ? round.moves[player.id].card : player.unused[0];
    player.unused = player.unused.filter(value=>value!==card);
    return {id:player.id,card};
  });
  round.phase = 'reveal';
  round.phaseUntil = now + round.settings.revealMs;
  round.version++;
}

export function numberRankings(round) {
  const sorted = [...round.players].sort((a,b)=>b.score-a.score);
  let rank = 0;
  return sorted.map(({id,score},index)=>{
    if (!index || sorted[index-1].score !== score) rank = index+1;
    return {id,score,rank};
  });
}

export function numberView(round, id) {
  const {id:match,version,turn,phase,settings,startsAt,endsAt,table,revealed,judgment} = round;
  const scores = Object.fromEntries(round.players.map(({id,score})=>[id,score]));
  if (phase === 'result') return {id:match,version,phase,settings,scores,ranking:numberRankings(round)};
  const player = round.players.find(entry=>entry.id===id);
  const own = player && Object.hasOwn(round.moves,id) ? round.moves[id] : null;
  const revealedPoints = pointCards(settings.handSize).filter(value=>!round.deck.includes(value));
  return {id:match,version,phase,turn,settings,startsAt,endsAt,table,scores,revealedPoints,
    ...(player && !revealed ? {unused:player.unused,own} : {}),
    ...(revealed ? {revealed} : {}),
    ...(judgment ? {judgment} : {}),
  };
}
