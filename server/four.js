import {FOUR_CHOICES,FOUR_COLORS,FOUR_DEFAULTS} from '../web/four-rules.js';
import {requireGame} from './room.js';
import {acceptsTimedMove,advanceTimedSelection,allTimedPlayersReady,beginTimedTurn,recordTimedMove,turnGrace} from './timed-turn.js';

const WIN_LENGTH = 4;
const DIRECTIONS = [[0,1],[1,0],[1,-1],[1,1]];
const openColumns = board => board[0].flatMap((piece,column)=>piece === null ? [column] : []);

export function fourSettings(current, patch, ids) {
  requireGame(patch && typeof patch === 'object' && !Array.isArray(patch),'設定が無効です。',400);
  for (const [key,value] of Object.entries(patch)) {
    const valid = key === 'starter' ? ids.includes(value) :
      Object.hasOwn(FOUR_CHOICES,key) && FOUR_CHOICES[key].includes(value);
    requireGame(valid,'設定値が範囲外です。',400);
  }
  return {...current,...patch};
}

export function startFour(ids, settings, now, timing) {
  settings = {...FOUR_DEFAULTS,...settings};
  const first = Math.max(0,ids.indexOf(settings.starter));
  const order = [...ids.slice(first),...ids.slice(0,first)];
  const palette = Object.keys(FOUR_COLORS);
  const round = {
    id:crypto.randomUUID(), ids, order, version:0, turn:0,
    settings:{...settings,starter:order[0]}, timing:turnGrace(timing),
    pieces:Object.fromEntries(order.map((id,index)=>[id,palette[index]])),
    board:Array.from({length:settings.size},()=>Array(settings.size).fill(null)),
    animation:null, outcome:null,
  };
  beginTimedTurn(round,now);
  return round;
}

export function submitFour(round, id, request, now) {
  requireGame(acceptsTimedMove(round,request.turn,now),'このターンの受付は終了しました。',409,'fourClosed');
  requireGame(round.ids.includes(id),'観戦中は列を選べません。',403,'forbidden');
  recordTimedMove(round,id,request.sequence,()=>{
    const {column} = request;
    requireGame(Number.isInteger(column) && round.board[0][column] === null,
      '空きのある列を選んでください。',400,'fourInvalid');
    return {column};
  });
}

export function winningCells(board, row, column) {
  const piece = board[row]?.[column];
  if (!piece) return [];
  const found = new Map();
  for (const [dr,dc] of DIRECTIONS) {
    const line = [[row,column]];
    for (const sign of [-1,1]) {
      let r = row + dr * sign, c = column + dc * sign;
      while (board[r]?.[c] === piece) {
        line.push([r,c]);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (line.length >= WIN_LENGTH) {
      for (const [r,c] of line) found.set(r * board.length + c,[r,c]);
    }
  }
  return [...found.values()];
}

function resolveDrop(board, column, piece) {
  for (let row = board.length - 1; row >= 0; row--) {
    if (board[row][column] === null) {
      board[row][column] = piece;
      return row;
    }
  }
  return null;
}

export function resolveFour(board, order, columns, pieces) {
  const drops = [];
  for (const id of order) {
    const column = columns[id];
    const row = resolveDrop(board,column,pieces[id]);
    const drop = {id,column,row,discarded:row === null,winning:false};
    drops.push(drop);
    if (drop.discarded) continue;
    const line = winningCells(board,row,column);
    if (line.length) {
      drop.winning = true;
      return {drops,outcome:{winner:id,line}};
    }
    if (board[0].every(piece=>piece !== null)) {
      return {drops,outcome:{winner:null,line:[]}};
    }
  }
  return {drops,outcome:null};
}

export function advanceFour(round, now, departed, random = Math.random) {
  if (round.phase === 'result') return;
  if (round.phase === 'drop') {
    if (now < round.animation.until) return;
    const {until} = round.animation;
    round.animation = null;
    delete round.submitted;
    if (round.outcome) {
      round.phase = 'result';
      round.version++;
    } else {
      round.order.push(round.order.shift());
      // Resume with a full window if the room missed the entire next selection phase.
      const nextEnd = until + round.timing.readyMs + round.settings.seconds * 1000;
      const base = round.settings.seconds !== null && now >= nextEnd ? now : until;
      beginTimedTurn(round,base);
      advanceTimedSelection(round,now,()=>false,true);
    }
    return;
  }

  if (!advanceTimedSelection(round,now,()=>allTimedPlayersReady(round,departed),true)) return;

  const available = openColumns(round.board);
  const columns = Object.fromEntries(round.order.map(id=>[id,Object.hasOwn(round.moves,id) ?
    round.moves[id].column : available[Math.floor(random() * available.length)]]));
  const {drops,outcome} = resolveFour(round.board,round.order,columns,round.pieces);
  round.animation = {from:now,until:now + drops.length * round.settings.dropMs,drops};
  round.outcome = outcome;
  round.submitted = Object.keys(round.moves);
  round.moves = {};
  round.phase = 'drop';
  round.version++;
}

export function fourView(round, id) {
  const {id:match,version,phase,turn,order,pieces,settings,board,outcome,animation,startsAt,endsAt} = round;
  return {
    id:match,version,phase,turn,order,pieces,settings,board,startsAt,endsAt,
    ...(outcome ? {outcome} : {}),
    ...(animation ? {animation} : {}),
    ...(round.ids.includes(id) && !animation && phase !== 'result' ?
      {own:Object.hasOwn(round.moves,id) ? round.moves[id] : null} : {}),
  };
}
