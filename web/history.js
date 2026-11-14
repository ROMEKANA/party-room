import {MODES} from './config.js';
import {avatars,button,cardDescription,drawRows,el,fit,progress,resultSummary,showLife,showProgress} from './board.js';

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
    row.append(timestamp,el('strong','history-topic',record.topic),el('span','history-meta',metadata(record)));
    list.append(row);
  }
  body.append(list);
  list.scrollTop = scrollTop;
}
export function historyDetail(body,record,me,card,selectCard) {
  const {result,players,cards,tiers} = record;
  const r = {...record,...result,phase:'result',
    scores:Object.fromEntries(players.filter(p=>p.score != null).map(p=>[p.id,p.score]))};
  const roster = el('section','players');
  roster.setAttribute('aria-label','ラウンドの参加者');
  avatars({me,round:r,players:players.map(p=>({...p,online:true}))},roster);
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
  showProgress(progress(r),r.total,count,bar);
  intro.append(title,subline,track);
  const board = el('section','board history-board');
  board.setAttribute('aria-label','ラウンドのTier表');
  drawRows(board,tiers,cards,selectCard);
  const resultBox = el('div','deck');
  resultBox.append(el('strong','deck-top',r.win?'クリア！':'ラウンド終了 · 失敗'),
    el('p','deck-message',resultSummary(r)));
  body.append(roster,intro,board,resultBox);
  if (card) {
    [...board.querySelectorAll('.tile')].find(tile=>tile.title===card.word)?.setAttribute('aria-pressed','true');
    const detail = el('section','history-card');
    detail.append(el('p','dialog-word',card.word),el('p','dialog-copy',cardDescription(card)));
    body.append(detail);
  }
  requestAnimationFrame(()=>{if (board.isConnected) fit(board);});
}
