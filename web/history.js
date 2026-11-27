import {isBattle,CIRCLE,NUMBER_CLASH,GAMES,TIER} from './games.js';
import {BATTLE_MODES} from './battle-rules.js';
import {battleHistory,battleOutcome} from './battle.js';
import {numberHistory} from './number-clash.js';
import {circleTable} from './circle.js';
import {consensusBoard,consensusCount,consensusOutcome} from './consensus.js';
import {MODES} from './config.js';
import {renderPlayers} from './player-display.js';
import {button,cardDescription,drawRows,el,fit,progress,resultSummary,showLife,showProgress} from './board.js';

const DIFFICULTIES = {easy:'簡単',normal:'普通',hard:'難しい'};
const time = new Intl.DateTimeFormat('ja-JP',{
  month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
});
export const metadata = record => [
  MODES[record.mode], DIFFICULTIES[record.difficulty], record.count+'人',
  '1人'+record.cardsPerPlayer+'枚・全'+record.total+'枚',
  record.parent ? '親 '+record.parent : '',
].filter(Boolean).join(' ／ ');

export function historyList(body,records,select,scrollTop) {
  const list = el('div','history-list');
  for (const record of records) {
    const row = button('',()=>select(record.id,list.scrollTop),'history-item control');
    const timestamp = el('time','history-time',time.format(record.endedAt));
    timestamp.dateTime = new Date(record.endedAt).toISOString();
    const game = GAMES[record.gameId] ?? GAMES[TIER];
    const circle = record.gameId===CIRCLE;
    if (record.gameId===NUMBER_CLASH) {
      row.append(timestamp,el('strong','history-topic',game.title),el('span','history-meta',record.count+'人'));
      list.append(row);
      continue;
    }
    const battle = isBattle(record.gameId);
    row.append(timestamp,el('span','history-game',(battle?'⚡ ':circle?'○× ':'▤ ')+game.title),
      el('strong','history-topic',battle?battleOutcome(record.outcome):circle?record.winner+'の勝利':record.topic),
      el('span','history-meta',battle?`${BATTLE_MODES[record.mode]} ／ ${record.count}人 ／ ${record.turn}ターン`:
        circle?`${record.count}人 ／ ${record.rounds}ラウンド`:
        [metadata(record),record.win==null?'':record.win?'クリア':'失敗'].filter(Boolean).join(' ／ ')));
    list.append(row);
  }
  body.append(list);
  list.scrollTop = scrollTop;
}
export function historyDetail(body,record,me,card,selectCard,selectedPlayer,selectPlayer) {
  if (record.gameId===NUMBER_CLASH) return numberHistory(body,record);
  const roster = el('section','players');
  roster.setAttribute('aria-label','対戦時の参加者');
  body.append(roster);
  if (isBattle(record.gameId)) {
    renderPlayers(roster,record.roster ?? record.players.map(({id,color})=>({id,color})),{me});
    return battleHistory(body,record);
  }
  if (record.gameId===CIRCLE) {
    renderPlayers(roster,record.roster ?? record.board.players.map(player=>({id:player.name})),{me});
    body.append(el('h3','circle-heading',record.winner+'の勝利'),
      el('p','circle-info',`${record.count}人 · ${record.rounds}ラウンド`));
    circleTable(body,record.board);
    return;
  }
  const {result,players,cards,tiers} = record;
  const r = {...record,...result,phase:'result',
    scores:Object.fromEntries(players.filter(p=>p.score != null).map(p=>[p.id,p.score]))};
  const consensus = r.mode===4;
  const player = selectedPlayer ?? players[0].id;
  renderPlayers(roster,players.map(p=>({...p,roles:p.id === r.parent ? ['親'] : []})),{
    me,selected:player,select:consensus ? selectPlayer : null,selectionLabel:id=>id+'のTier表',
  });
  const intro = el('section','intro');
  const title = el('div','title-line');
  const life = el('span','pill');
  title.append(el('h1','history-topic',record.topic),life);
  showLife(r,life);
  const subline = el('div','subline');
  const count = el('span','history-progress');
  subline.append(el('span','',metadata(record)),count);
  const track = el('div','progress-track'), bar = el('div','history-bar');
  track.append(bar);
  intro.append(title,subline);
  if (consensus) count.textContent = consensusCount(r);
  else {
    showProgress(progress(r),r.total,count,bar);
    intro.append(track);
  }
  const board = el('section','board history-board');
  board.setAttribute('aria-label','ラウンドのTier表');
  drawRows(board,tiers,consensus?consensusBoard(r,player):cards,selectCard);
  const resultBox = el('div','deck');
  resultBox.append(el('strong','deck-top',consensus?consensusOutcome(result):r.win?'クリア！':'ラウンド終了 · 失敗'));
  if (!consensus) resultBox.append(el('p','deck-message',resultSummary(r)));
  body.append(intro,board,resultBox);
  if (card) {
    [...board.querySelectorAll('.tile')].find(tile=>tile.title===card.word)?.setAttribute('aria-pressed','true');
    const detail = el('section','history-card');
    detail.append(el('p','dialog-word',card.word),el('p','dialog-copy',cardDescription(card)));
    body.append(detail);
  }
  requestAnimationFrame(()=>{if (board.isConnected) fit(board);});
}
