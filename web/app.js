import {COLORS,MODES} from './config.js';
import {$,avatars,board,button,el,fit,progress,resultSummary,short,showLife,showProgress} from './board.js';
import {connect,storedName} from './sync.js';
import {consensusBoard,consensusCount,consensusOutcome,consensusPlayers} from './consensus.js';
import {placementProblem,remainingCards} from './placement.js';
import {BATTLE,CIRCLE,GAMES,TIER} from './games.js';
import {VERSION} from './version.js';
import {lobby} from './party.js';
import {circlePlay,circleSettings} from './circle.js';
import {battleSettings,battleUI} from './battle.js';
import {dialogs,tierSettings} from './dialogs.js';

let state = null, lastScreen = '', joining = false;
let resultRound, resultPlayer;
const renderBattle = battleUI();
let ownBoardRound, ownCardsHidden = false;
const panel = dialogs(()=>state,(...args)=>sync.send(...args),(id,game)=>sync.history(id,game));
const sync = connect((next,previous) => {
  state = next;
  if (!previous || next.round?.id !== previous.round?.id || next.round?.version !== previous.round?.version ||
      next.round?.draftRevision !== previous.round?.draftRevision ||
      $('notice').dataset.connection === 'true') notice('');
  render();
}, (message,network) => {
  if (network || !panel.error(message)) notice(message,network);
}, message => {
  state = null;
  $('join-error').textContent = message;
  render();
},(version,s)=>{
  const overlay = $('update-overlay');
  if (!version) {
    if (overlay.open) overlay.close();
    return;
  }
  $('update-version').textContent = `現在のバージョン ${VERSION} ／ 最新バージョン ${version}`;
  $('update-reconnect').hidden = !s;
  $('update-now').onclick = ()=>sync.refresh(version);
  if (!overlay.open) overlay.showModal();
});
$('update-overlay').addEventListener('cancel',event=>event.preventDefault());
$('brand-version').textContent = 'ver'+VERSION;
$('brand-version').setAttribute('aria-label','ver'+VERSION+'のアップデート情報を開く');
function notice(message,network = false) {
  $('notice').dataset.connection = String(network);
  $('notice').textContent = message;
  $('notice').hidden = !message;
}
$('name').value = storedName();
$('join').onsubmit = async event => {
  event.preventDefault();
  if (joining) return;
  const name = $('name').value.trim();
  if (!name || [...name].length>20) {
    $('join-error').textContent = '名前を1〜20文字で入力してください。';
    return;
  }
  joining = true;
  const submit = event.currentTarget.querySelector('button');
  submit.disabled = true;
  try {
    await sync.join(name);
    $('join-error').textContent = '';
  } catch (error) {
    $('join-error').textContent = error.code?error.message:'接続できませんでした。もう一度お試しください。';
  } finally {
    submit.disabled = false;
    joining = false;
  }
};
for (const id of ['settings','rules','menu','roundHistory']) $(id).onclick = ()=>panel.open(id);
for (const id of ['brand-version','release-history']) {
  $(id).onclick = event=>panel.open('releaseHistory',{trigger:event.currentTarget.id});
}
new ResizeObserver(()=>fit()).observe($('board'));
function viewport() {
  const view = window.visualViewport;
  if (view) {
    document.documentElement.style.setProperty('--viewport',view.height+'px');
    document.documentElement.style.setProperty('--viewport-top',view.offsetTop+'px');
  }
}
window.visualViewport?.addEventListener('resize',viewport);
window.visualViewport?.addEventListener('scroll',viewport);
viewport();

let wakeLock = null, wakeLockPending = false;
async function keepScreenAwake() {
  if (!navigator.wakeLock || document.visibilityState !== 'visible' ||
      wakeLockPending || (wakeLock && !wakeLock.released)) return;
  wakeLockPending = true;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    // The browser or OS can deny the request, for example in low power mode.
  } finally {
    wakeLockPending = false;
  }
}
document.addEventListener('visibilitychange',keepScreenAwake);
document.addEventListener('pointerdown',keepScreenAwake,{passive:true});
window.addEventListener('pageshow',keepScreenAwake);
keepScreenAwake();

function render() {
  const r = state?.round;
  if (ownBoardRound !== r?.id) {
    ownBoardRound = r?.id;
    ownCardsHidden = false;
  }
  $('entrance').hidden = Boolean(state);
  $('release-history').hidden = Boolean(state);
  $('nav').hidden = $('players').hidden = !state;
  const tierBoard = Boolean(state?.game === TIER && r);
  for (const id of ['intro','board','deck']) $(id).hidden = !tierBoard;
  $('party').hidden = !state || tierBoard;
  $('rules').hidden = $('settings').hidden = !state?.game;
  document.querySelector('.app').classList.toggle('party-layout',Boolean(state && !tierBoard));
  if (!state) {
    lastScreen = '';
    notice('');
    panel.render();
    return;
  }
  const s = state;
  const watching = s.game === BATTLE && r ? !r.players.some(p=>p.id===s.me) :
    s.players.find(p=>p.id===s.me)?.spectator;
  if (!tierBoard) {
    const key = JSON.stringify(s);
    if (key !== lastScreen) {
      lastScreen = key;
      avatars(s);
      const root = $('party');
      root.replaceChildren();
      const battle = s.game === BATTLE;
      root.className = 'party-screen '+(!s.game?'lobby-screen':r?(battle?'battle-screen':'circle-screen'):'setup-screen');
      const send = (...args)=>sync.send(...args);
      if (!s.game) lobby(root,s,send,(...args)=>panel.open(...args));
      else {
        const host = s.me===s.host;
        const title = el('h1','party-title',GAMES[s.game].title);
        if (watching) title.append(el('span','spectator-status','観戦中'));
        if (!battle || !r || watching) root.append(title);
        if (watching && !r) root.append(el('p','deck-message','空きができると順番に参加します。'));
        if (battle) {
          if (r) renderBattle(root,s,send,sync.serverNow);
          else battleSettings(root,s,send);
        } else if (r) circlePlay(root,r,send,host);
        else if (s.game===CIRCLE) circleSettings(root,s);
        else {
          const settings = el('div','setup-columns');
          const columns = [el('section','setup-fields'),el('section','setup-fields')];
          columns.forEach((column,index)=>tierSettings(column,s,index,null,
            patch=>send('settings',{settings:patch})));
          settings.append(...columns);
          root.append(settings);
          if (s.startProblem) root.append(el('p','deck-message',s.startProblem));
        }
        if (host && !s.playing) {
          const actions = el('div','party-actions');
          const start = button(r?'もう一度遊ぶ':'ゲーム開始',()=>send('start'),'primary');
          start.disabled = Boolean(s.startProblem);
          actions.append(start);
          if (r) actions.append(button('設定に戻る',()=>send('backSettings')));
          actions.append(button('ロビーに戻る',()=>send('lobby')));
          root.append(actions);
        } else if (!r && !host) root.append(el('p','deck-message','ホストがゲームを開始します。'));
      }
    }
    panel.render();
    return;
  }
  const consensusResult = r?.mode===4 && r.phase==='result';
  if (consensusResult && resultRound!==r.id) {
    resultRound = r.id;
    resultPlayer = r.players.find(p=>p.id===s.me)?.id ?? r.players[0].id;
  }
  const ownBoard = r?.mode===4 && (r.final || (consensusResult && resultPlayer===s.me));
  const hideCards = Boolean(ownBoard && ownCardsHidden);
  $('board').classList.toggle('cards-hidden',hideCards);
  const key = JSON.stringify([s,consensusResult ? resultPlayer : null,hideCards]);
  if (lastScreen !== key) {
    lastScreen = key;
    if (consensusResult) {
      consensusPlayers($('players'),r.players,s.me,resultPlayer,id=>{
        resultPlayer=id;
        panel.close();
        render();
        $('players').querySelector('[aria-pressed=true]')?.focus({preventScroll:true});
      });
    } else avatars(s.roundPlayers ? {...s,players:s.roundPlayers} : s);
    board(consensusResult ? {...s,round:{...r,cards:consensusBoard(r,resultPlayer)}} : s,card=>{
      const live = state.round;
      if (live?.mode===2 && live.canPlace && live.cards.some(c=>c.id===card.id&&c.placed)) {
        sync.send('select',{card:card.id},live);
      } else if (live?.mode===4 && live.canPlace) panel.open('move',{card});
      else panel.open('preview',{card});
    });
    $('board-title').textContent = r?.topic || (r?.mode===3 && r.phase!=='topic' ? 'お題は？' : MODES[s.settings.mode]);
    $('board-title').title = r?.topic ?? '';
    $('progress-bar').parentElement.hidden = Boolean(consensusResult);
    if (consensusResult) $('progress').textContent = consensusCount(r);
    else if (r?.mode===4) {
      const input = r.phase==='input';
      const rest = input ? r.inputRemaining : r.remaining;
      const total = input ? r.cardsPerPlayer : r.total;
      $('progress').textContent = rest==null ? '' : `残り ${rest} / ${total} 枚`;
      $('progress-bar').style.width = rest==null ? '0%' : (1-rest/total)*100+'%';
    } else if (r) {
      const count = progress(r);
      showProgress(count,r.total,$('progress'),$('progress-bar'));
      if (r.mode===2 && r.phase==='placement') {
        $('progress').textContent = '残り '+remainingCards(r.total,count)+' / '+r.total+' 枚';
      }
    } else {
      $('progress').textContent = `${s.players.filter(p=>p.online).length} / 10 人`;
      $('progress-bar').style.width = '0%';
    }
    showLife(r,$('life'));
    $('phase-label').textContent = (watching?'観戦中 · ':'')+({
      topic:'お題決め',input:'カード入力',placement:'Tierを選択',vote:'投票中',
      turnResult:'カード判定',attemptResult:'回答判定',oral:'お題の推理',result:'ラウンド結果',
    }[r?.phase] ?? '参加者を待っています');
    deck(s,ownBoard,hideCards);
  }
  panel.render();
}
function deck(s,ownBoard,hideCards) {
  const r = s.round, host = s.host===s.me, area = $('current'), choices = $('choices');
  const prior = area.querySelector('.hero-card')?.dataset.card;
  area.replaceChildren();
  choices.replaceChildren();
  choices.style.setProperty('--tier-count',s.tiers.length);
  const label = value => {$('deck-label').textContent = value;};
  const line = value => area.append(el('p','deck-message',value));
  const add = (name,cb,kind='control') => {
    const control = button(name,cb,kind);
    choices.append(control);
    choices.classList.add('actions');
    return control;
  };
  const send = (type,fields={})=>sync.send(type,fields,r);
  const fullBoard = (r?.mode===2 || r?.mode===4) &&
    (['attemptResult','result'].includes(r.phase) || (r.phase==='placement' && r.cards.filter(c=>c.placed).length===r.total));
  $('deck').classList.toggle('full-board',fullBoard);
  const toggleOwnBoard = () => {
    const control = add(hideCards?'自分のTier表を表示':'自分のTier表を非表示',()=>{
      ownCardsHidden = !ownCardsHidden;
      render();
      $('toggle-own-board').focus({preventScroll:true});
    },'primary');
    control.id = 'toggle-own-board';
  };
  const nextRound = () => {
    if (host) {
      add('もう一度遊ぶ',()=>send('start'),'primary').disabled=Boolean(s.startProblem);
      add('設定に戻る',()=>send('backSettings'));
      add('ロビーに戻る',()=>send('lobby'));
    }
  };
  choices.classList.remove('actions');
  area.classList.toggle('has-card',Boolean(r?.current && ['placement','vote'].includes(r.phase)));
  if (!r) {
    label('待機中');
    line(s.startProblem || (host?'準備ができたらゲームを開始できます。':'ホストがゲームを開始します。'));
    if (host) add('ゲーム開始',()=>send('start'),'primary').disabled=Boolean(s.startProblem);
  } else if (r.phase==='topic') {
    label('お題');
    line(short(r.setter)+'さんがお題を選んでいます。');
  } else if (r.phase==='input') {
    label('単語を準備中');
    line(r.mode===1 ? short(r.turn)+'さんが入力中です。' : r.mode===4
      ? '全員のカードがそろうまでお待ちください。' : '子が秘密Tierに沿って単語を入力しています。');
    if (r.mode===4 && r.ownCards?.length) add('自分の投稿を確認・修正',()=>panel.open('ownCards'));
  } else if (r.phase==='placement' || r.phase==='vote') {
    if (r.mode===4 && r.final) {
      label('提出完了');
      line('ほかのプレイヤーを待っています。');
      toggleOwnBoard();
      return;
    }
    if (r.mode===4 && !r.canPlace) {
      label('Tier表を作成中');
      line('参加者がそれぞれのTier表を作っています。');
      return;
    }
    label(r.phase==='vote'?'仮配置を投票中':r.mode===2?'親がカードを配置':'このカードは、どのTier？');
    if (r.current) {
      const hero = button(r.current.word,()=>panel.open('preview',{card:r.current}),'hero-card');
      hero.dataset.card = r.current.id;
      if (prior===r.current.id) hero.style.animation='none';
      area.append(hero);
    } else line('すべてのカードを配置しました。');
    if (r.feedback?.rejected) label('候補は否決されました。別のTierを提案できます。');
    if (r.canPlace && r.current) {
      for (const tier of s.tiers) {
        const b = button(tier,()=>{
          send(r.mode===1?'propose':'place',{tier,card:r.current.id});
        },'choice');
        b.style.setProperty('--tier',COLORS[tier]);
        b.setAttribute('aria-label',tier+'に配置');
        b.disabled = r.excluded.includes(tier);
        choices.append(b);
      }
    }
    if (r.canSubmit) add(r.mode===4?'最終確定':'回答を提出',()=>{
      const issue = placementProblem(s.tiers,r.cards.filter(card=>card.placed).map(card=>card.placed),r.total);
      if (issue) notice(issue);
      else panel.open('submit');
    },'primary');
  } else if (r.phase==='turnResult') {
    const f=r.feedback;
    label(f.correct?'正解！':'不正解');
    line(f.word+' · 提案 '+f.tier+(f.answer?' ／ 正解 '+f.answer:' ／ 同じカードで再挑戦'));
    if (host) add(r.fixed===r.total?'結果へ':f.answer?'次へ':'再挑戦',()=>send('next'),'primary');
  } else if (r.phase==='attemptResult') {
    label(r.target==null?'回答の判定':'目標正答率に届きませんでした');
    line(r.target==null ? `正解は ${r.feedback.score} / ${r.total} 枚 · 提出 ${r.attempts} 回`
      : resultSummary({...r,correctCount:r.feedback.score}));
    if (host) add(r.feedback.done?'結果へ':'再挑戦',()=>send('next'),'primary');
  } else if (r.phase==='oral') {
    label('口頭で回答');
    line(short(r.parent)+'さんがTier表からお題を当てます。');
    if (r.canJudge) add('正誤を判定',()=>panel.open('judge'),'primary');
  } else if (r.phase==='result') {
    label(r.mode===4 ? consensusOutcome(r.result) : r.result.win?'クリア！':'ラウンド終了 · 失敗');
    if (r.mode!==4) line(resultSummary({...r,correctCount:r.feedback?.score}));
    if (r.mode===1 && r.history.length) add('誤答の詳細',()=>panel.open('history'));
    if (host && s.startProblem) line(s.startProblem);
    if (ownBoard) toggleOwnBoard();
    nextRound();
  }
}
render();
