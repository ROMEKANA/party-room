import {button,el} from './board.js';
import {FOUR_CHOICES,FOUR_COLORS} from './four-rules.js';
import {setting} from './settings.js';
import {timedTurnUI} from './timed-turn.js';

export const FOUR_RULES = [
  ['列を選ぶ','2〜4人で遊びます。列の上の▽を押して提出します。全員が提出するか時間切れになるまで変更でき、時間切れで未提出なら空きのある列を自動で選びます。'],
  ['順番に落とす','コマを落とす順番はアイコンの下に表示します。最初に落とす人はターンごとに交代します。先に落ちたコマで列が満杯になった場合、その列を選んだ後続のコマは消えます。'],
  ['4つつなげて勝つ','タテ・ヨコ・ナナメに同じ色を4つ以上先につなげた人が勝ちです。盤面が埋まっても誰もつなげられなければ引き分けです。'],
];

const BASIC = {size:'盤面サイズ',starter:'開始プレイヤー',seconds:'選択制限時間'};
const DETAIL = {dropMs:'1コマの落下時間'};
const format = (key,value) => {
  if (key === 'size') return value+'×'+value;
  if (key === 'seconds') return value === null ? 'なし' : value+'秒';
  if (key === 'starter') return value ?? '参加待ち';
  return value+'ms';
};

export function fourSettings(root,s,send,tab = null) {
  const fields = tab === 1 ? DETAIL : BASIC;
  const settings = s.playing ? s.round.settings : s.fourSettings;
  const container = tab === null ? el('section','setup-fields') : root;
  if (tab === null) container.append(el('h2','setup-heading','基本設定'));
  for (const [key,title] of Object.entries(fields)) {
    const ids = s.playing ? s.round.order : s.players.filter(p=>!p.spectator).map(p=>p.id);
    const choices = key === 'starter' ? ids : FOUR_CHOICES[key];
    container.append(setting(title,key,choices.map(value=>[value,format(key,value)]),settings[key],
      choices.length > 0 && s.host === s.me && !s.playing,send));
  }
  if (tab === null) {
    root.append(container);
    if (s.startProblem) root.append(el('p','deck-message',s.startProblem));
  }
}

export const fourResultLabel = winner => winner === null ? '引き分け' : winner+'の勝ち！';

export function fourPlayer(player, pieces, order = []) {
  const rank = order.indexOf(player.id);
  const color = Object.hasOwn(pieces,player.id) ? pieces[player.id] : null;
  return {
    ...player,
    roles:[...(player.roles ?? []),...(rank < 0 ? [] : [rank+1+'番目'])],
    ...(color ? {marker:FOUR_COLORS[color]} : {}),
  };
}

function makeBoard(size) {
  const board = el('div','four-board');
  board.style.setProperty('--four-size',size);
  board.setAttribute('role','table');
  board.setAttribute('aria-label',size+'×'+size+'の盤面');
  const cells = Array.from({length:size},()=>{
    const row = el('div','four-row');
    row.setAttribute('role','row');
    board.append(row);
    return Array.from({length:size},()=>{
      const cell = el('div','four-cell');
      cell.setAttribute('role','cell');
      const piece = el('span','four-piece');
      cell.append(piece);
      row.append(cell);
      return {cell,piece};
    });
  });
  function paint(rows,line = []) {
    const highlighted = new Set(line.map(([r,c])=>r*size+c));
    for (const [r,row] of cells.entries()) {
      for (const [c,{cell,piece}] of row.entries()) {
        const color = rows[r][c];
        const won = highlighted.has(r*size+c);
        piece.dataset.piece = color ?? '';
        cell.classList.toggle('four-winning',won);
        cell.setAttribute('aria-label',color ? FOUR_COLORS[color].label+(won ? '（勝利）' : '') : '空き');
      }
    }
  }
  return {board,paint};
}

export function fourResult(root,record) {
  const {board,paint} = makeBoard(record.board.length);
  const stage = el('div','four-stage four-final');
  const winner = record.outcome ? record.outcome.winner : record.winner;
  paint(record.board,record.outcome?.line ?? record.line);
  stage.append(board);
  root.append(el('h2','four-winner',fourResultLabel(winner)),stage);
}

export function fourHistory(root,record) {
  const settings = el('dl','circle-settings');
  for (const [key,title] of Object.entries({...BASIC,...DETAIL})) {
    settings.append(el('dt','',title),el('dd','',format(key,record.settings[key])));
  }
  root.append(settings);
  fourResult(root,record);
}

export function fourUI() {
  let match, area, update, controller;
  function reset() {
    controller?.abort();
    match = area = update = controller = null;
  }
  function render(root,s,send,serverNow) {
    if (match !== s.round.id || area?.parentElement !== root) {
      reset();
      match = s.round.id;
      controller = new AbortController();
      area = el('section','four-play');
      root.append(area);
      update = mount(area,s.round.board.length,send,serverNow,controller.signal);
    }
    update(s.round,!s.roundPlayers.some(p=>p.id === s.me));
  }
  return {render,reset};
}

function mount(root,size,send,serverNow,signal) {
  const timer = timedTurnUI(root,{
    serverNow,signal,reserveTrack:true,onOpenChange:paintChoices,
    onFrame(now) {
      if (!round.animation) return false;
      paintDrop(now);
      return now < round.animation.until;
    },
  });

  const stage = el('div','four-stage');
  const columns = el('div','four-columns');
  columns.style.setProperty('--four-size',size);
  const field = makeBoard(size);
  const choices = Array.from({length:size},(_,column)=>{
    const choice = button('',()=>choose(column),'four-choice');
    choice.setAttribute('aria-label',(column+1)+'列目');
    choice.append(el('span','four-arrow','▽'));
    columns.append(choice);
    return choice;
  });
  const falling = el('span','four-piece four-falling');
  falling.setAttribute('aria-hidden','true');
  stage.append(columns,field.board);
  root.append(stage);

  let round, watching, pending, sequence = 0;
  let paintedStep, skipAnimation;
  function paintChoices(canChoose) {
    const selected = pending?.column ?? round.own?.column;
    for (const [column,choice] of choices.entries()) {
      const full = round.board[0][column] !== null;
      const pressed = column === selected;
      choice.disabled = watching || !canChoose || full;
      choice.setAttribute('aria-label',(column+1)+'列目'+(full ? '（満杯）' : ''));
      choice.setAttribute('aria-pressed',String(pressed));
      choice.firstChild.textContent = pressed ? '▼' : '▽';
    }
  }

  async function choose(column) {
    if (watching || !timer.isOpen() || round.board[0][column] !== null) return;
    const base = round;
    const move = {column,sequence:++sequence};
    pending = move;
    paintChoices(true);
    await send('fourColumn',{...move,turn:base.turn},base);
    if (pending === move) {
      pending = null;
      paintChoices(timer.isOpen());
    }
  }

  function paintDrop(now) {
    const {drops,from} = round.animation;
    const duration = round.settings.dropMs;
    const elapsed = Math.max(0,now-from);
    const step = skipAnimation ? drops.length : Math.min(drops.length,Math.floor(elapsed/duration));
    if (step === paintedStep) return;
    paintedStep = step;
    falling.remove();
    const visible = round.board.map(row=>row.slice());
    for (const drop of drops.slice(step)) {
      if (!drop.discarded) visible[drop.row][drop.column] = null;
    }
    const finished = step === drops.length;
    field.paint(visible,finished ? round.outcome?.line : undefined);
    if (finished) return;

    const drop = drops[step];
    falling.dataset.piece = round.pieces[drop.id];
    falling.classList.toggle('four-discarded',drop.discarded);
    falling.style.setProperty('--drop-column',drop.column);
    falling.style.setProperty('--drop-row',drop.row ?? -1);
    falling.style.setProperty('--drop-duration',duration+'ms');
    falling.style.setProperty('--drop-delay',-(elapsed % duration)+'ms');
    field.board.append(falling);
  }

  return (next,isWatching)=>{
    const advance = round?.turn !== next.turn;
    const newAnimation = next.animation && round?.animation?.from !== next.animation.from;
    if (newAnimation) {
      skipAnimation = !round || advance;
      paintedStep = undefined;
    }
    if (advance) {
      sequence = 0;
      pending = null;
    }
    sequence = Math.max(sequence,next.own?.sequence ?? 0);
    round = next;
    watching = isWatching;
    const turnLabel = next.turn+'ターン目'+(watching ? '・観戦中' : '');
    columns.style.visibility = next.animation || watching ? 'hidden' : '';
    if (!round.animation) {
      falling.remove();
      field.paint(round.board);
    }
    timer.update(next,{
      title:next.outcome && next.animation ? now=>now >= next.animation.until ? fourResultLabel(next.outcome.winner) : turnLabel : turnLabel,
      label:next.animation ? 'コマを落としています' : null,
    });
  };
}
