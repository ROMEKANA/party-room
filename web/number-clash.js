import {button,el} from './board.js';
import {holdButton} from './hold.js';
import {NUMBER_BASIC_FIELDS,NUMBER_CHOICES,handCards,pointCards} from './number-clash-rules.js';
import {setting} from './settings.js';
import {turnIsOpen,turnTimeFraction,turnTimeLabel} from './timed-turn.js';

export const NUMBER_RULES = [
  ['手札を1枚出す','2〜6人の個人戦です。全員が同じ数字の手札を持ち、毎ターン、場に得点カードが1枚加わります。手札はタップで選択し、全員が選ぶか制限時間になるまで変更できます。時間切れで未選択なら、残り手札の最小値を出します。'],
  ['重複は全員失点','同じ数字を出した人は全員が得点の対象外になり、設定された0〜3点を1人ずつ失います。出した手札は重複しても消費します。'],
  ['合計得点と持ち越し','場の合計が0以上なら最大値、マイナスなら最小値が対象です。持ち越しONでは、その数字が重複すると次点には渡らず場を持ち越します。OFFでは重複を除いた中で判定し、全員が重複したときだけ持ち越します。'],
  ['最終得点で決着','持ち越されたカードは次のカードと合算します。最後まで獲得者が決まらなければ場のカードは破棄します。全員が手札を使い切ったら、累計得点が高い順に順位が決まります。同点は同順位です。'],
  ['残りの得点カード','「残りの得点カード」を長押しすると、まだ公開されていない得点カードを確認できます。押している間も対戦は進みます。'],
];

const BASIC = {...NUMBER_BASIC_FIELDS,seconds:'選択制限時間'};
const DETAIL = {
  readyMs:'ターン開始前の通信猶予', graceMs:'ターン終了時の通信猶予',
  revealMs:'カード公開表示時間', judgmentMs:'得点判定表示時間',
};
const formatSetting = (key,value) => {
  if (key === 'handSize') return value+'枚';
  if (key === 'penalty') return value+'点';
  if (key === 'carryExtreme') return value ? 'ON' : 'OFF';
  if (key === 'seconds') return value === null ? 'なし' : value+'秒';
  return value+'ms';
};
const signed = value => value > 0 ? '+'+value : String(value).replace('-','−');

export function numberSettings(root,s,send,tab = null) {
  const settings = s.playing ? s.round.settings : s.numberSettings;
  const fields = tab === 1 ? DETAIL : BASIC;
  const container = tab === null ? el('section','setup-fields number-settings') : root;
  if (tab === null) container.append(el('h2','setup-heading','基本設定'));
  for (const [key,title] of Object.entries(fields)) {
    container.append(setting(title,key,NUMBER_CHOICES[key].map(value=>[value,formatSetting(key,value)]),
      settings[key],s.host === s.me && !s.playing,send));
  }
  if (tab === null) {
    root.append(container);
    if (s.startProblem) root.append(el('p','deck-message',s.startProblem));
  }
}

export function numberRanking(root,ranking) {
  const list = el('ol','number-ranking');
  list.setAttribute('aria-label','最終ランキング');
  for (const {id,rank,score} of ranking) {
    const name = el('strong','number-rank-name',id);
    name.title = id;
    const row = el('li','number-rank');
    row.value = rank;
    row.append(el('span','number-rank-place',rank+'位'),name,el('span','number-rank-score',signed(score)+'点'));
    list.append(row);
  }
  root.append(list);
}

export function numberHistory(root,record) {
  const settings = el('dl','circle-settings');
  for (const [key,title] of Object.entries(NUMBER_BASIC_FIELDS)) {
    settings.append(el('dt','',title),el('dd','',formatSetting(key,record.settings[key])));
  }
  root.append(settings);
  numberRanking(root,record.ranking);
}

const pointsCard = (value,used=false) => el('span','number-card number-point '+
  (value < 0 ? 'number-negative' : 'number-positive')+(used ? ' number-used' : ''),signed(value));

export function numberClashUI() {
  let controller, board, update;
  function reset() {
    controller?.abort();
    controller = board = update = null;
  }

  function render(root,s,send,serverNow) {
    const r = s.round;
    if (r.phase === 'result') {
      reset();
      numberRanking(root,r.ranking);
      return;
    }
    if (board?.parentElement !== root || board.dataset.match !== r.id) {
      reset();
      controller = new AbortController();
      board = el('section','number-board');
      board.dataset.match = r.id;
      root.append(board);
      update = mountNumberBoard(board,controller.signal,send,serverNow);
    }
    update(r, !s.roundPlayers.some(p=>p.id===s.me));
  }

  return {render,reset};
}

function mountNumberBoard(root,signal,send,serverNow) {
  const turn = el('strong');
  const clock = el('span','battle-clock');
  const heading = el('div','battle-turn-heading');
  const track = el('div','progress-track battle-clock-track');
  const bar = el('div','battle-clock-bar');
  const header = el('div','battle-turn');
  track.append(bar);
  heading.append(turn,clock);
  header.append(heading,track);
  const pot = el('section','number-pot');
  const total = el('strong','number-total');
  const table = el('div','number-table');
  pot.append(total,table);
  const lower = el('section','number-lower');
  const content = el('div','number-phase');
  const peek = el('div','number-grid number-peek');
  const footer = el('div','number-footer');
  const hold = button('残りの得点カード',null,'control number-hold');
  const status = el('p','number-status');
  status.setAttribute('aria-live','polite');
  footer.append(status,hold);
  content.setAttribute('aria-label','手札とターン結果');
  peek.setAttribute('aria-label','残りの得点カード');
  peek.hidden = true;
  lower.append(content,peek);
  root.append(header,pot,lower,footer);
  hold.setAttribute('aria-expanded','false');
  holdButton(hold,held=>{
    peek.hidden = !held;
    content.hidden = held;
    hold.setAttribute('aria-expanded',String(held));
  },{cancelOnExit:false,signal});

  let round, watching, sequence = 0, pending, isOpen;
  let menuKey, boardKey;
  let hand = [];
  function paintHand(open) {
    const selected = pending?.card ?? round.own?.card;
    for (const [number,card] of hand) {
      card.disabled = !open || !round.unused?.includes(number);
      card.setAttribute('aria-pressed',String(number === selected));
    }
  }

  async function choose(card) {
    const r = round;
    if (!turnIsOpen(r,serverNow()) || !r.unused?.includes(card)) return;
    const sent = {card,sequence:++sequence};
    pending = sent;
    paintHand(true);
    await send('numberCard',{...sent,turn:r.turn},r);
    if (pending === sent) {
      pending = null;
      paintHand(turnIsOpen(round,serverNow()));
    }
  }

  function paintClock() {
    const now = serverNow();
    const open = turnIsOpen(round,now);
    const review = round.phase === 'reveal' || round.phase === 'judgment';
    const label = review ? (round.phase === 'reveal' ? 'カード公開' : '得点判定') : turnTimeLabel(round,now);
    if (clock.textContent !== label) clock.textContent = label;
    track.style.visibility = review || round.endsAt === null ? 'hidden' : '';
    if (round.endsAt !== null && !review) bar.style.transform = 'scaleX('+turnTimeFraction(round,now)+')';
    if (isOpen !== open) {
      isOpen = open;
      paintHand(open);
    }
  }

  function renderContent() {
    const r = round;
    hand = [];
    content.replaceChildren();
    if (r.revealed) {
      const grid = el('div','number-grid number-revealed');
      grid.style.setProperty('--number-rows',Math.ceil(r.revealed.length / 3));
      for (const {id,card:number} of r.revealed) {
        const card = el('div','number-card number-played');
        const name = el('span','number-name',id);
        name.title = id;
        card.append(name,el('strong','',number));
        if (r.judgment?.duplicates.includes(id)) {
          card.classList.add('number-used');
          if (r.settings.penalty) card.append(el('span','number-penalty','−'+r.settings.penalty+'点'));
        }
        if (r.judgment?.winner === id) {
          card.classList.add(r.judgment.total < 0 ? 'number-loss' : 'number-gain');
          card.append(el('span','number-award',signed(r.judgment.total)+'点'));
        }
        grid.append(card);
      }
      content.append(grid);
    } else if (watching) {
      content.append(el('p','deck-message number-watching','全員のカードが公開されるまでお待ちください。'));
    } else {
      const grid = el('div','number-grid number-hand');
      grid.style.setProperty('--number-rows',r.settings.handSize / 3);
      hand = handCards(r.settings.handSize).map(number=>{
        const card = button(number,()=>choose(number),'number-card number-choice');
        card.classList.toggle('number-used',!r.unused.includes(number));
        grid.append(card);
        return [number,card];
      });
      content.append(grid);
    }
  }

  function update(r,spectator) {
    if (round?.turn !== r.turn) {
      sequence = 0;
      pending = null;
    }
    round = r;
    watching = spectator;
    sequence = Math.max(sequence,r.own?.sequence ?? 0);
    if (pending && r.own?.sequence >= pending.sequence) pending = null;
    const turnLabel = `ターン ${r.turn} / ${r.settings.handSize}`+(spectator ? ' ・ 観戦中' : '');
    if (turn.textContent !== turnLabel) turn.textContent = turnLabel;

    const pointKey = JSON.stringify(r.revealedPoints);
    if (menuKey !== pointKey) {
      menuKey = pointKey;
      const sum = r.table.reduce((result,value)=>result+value,0);
      total.textContent = r.table.length > 1 ? '合計 '+signed(sum)+'点' : '場の得点カード';
      table.style.setProperty('--table-columns',Math.min(5,r.table.length));
      table.style.setProperty('--table-rows',Math.ceil(r.table.length / 5));
      table.replaceChildren(...r.table.map(value=>pointsCard(value)));
      peek.style.setProperty('--number-rows',r.settings.handSize / 3);
      peek.replaceChildren(...pointCards(r.settings.handSize).map(value=>pointsCard(value,r.revealedPoints.includes(value))));
    }
    const key = JSON.stringify([r.turn,r.unused,r.revealed,r.judgment,spectator]);
    if (boardKey !== key) {
      boardKey = key;
      renderContent();
    }
    const message = r.judgment && r.judgment.winner === null ?
      (r.turn === r.settings.handSize ? '場の得点カードは破棄' : '場の得点カードを持ち越し') : '';
    if (status.textContent !== message) status.textContent = message;
    isOpen = undefined;
    paintClock();
  }

  function tick() {
    if (signal.aborted) return;
    if (round) paintClock();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  return update;
}
