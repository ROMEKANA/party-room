import {COLORS,MODES} from './config.js';
import {$,avatars,board,button,el,fit,progress,resultSummary,short,showLife,showProgress} from './board.js';
import {connect,storedName} from './sync.js';
import {dialogs} from './dialogs.js';

let state = null, lastScreen = '', joining = false;
const panel = dialogs(()=>state,(...args)=>sync.send(...args),id=>sync.history(id));
const sync = connect((next) => {
  state = next;
  notice('');
  render();
}, (message,network) => {
  if (network || !panel.error(message)) notice(message);
}, message => {
  state = null;
  $('join-error').textContent = message;
  render();
});
function notice(message) {
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
  $('entrance').hidden = Boolean(state);
  for (const id of ['nav','players','intro','board','deck']) $(id).hidden = !state;
  if (!state) {
    lastScreen = '';
    notice('');
    panel.render();
    return;
  }
  const s = state, r = s.round;
  const key = JSON.stringify(s);
  if (lastScreen !== key) {
    lastScreen = key;
    avatars(s);
    board(s,card=>{
      const live = state.round;
      if (live?.mode===2 && live.canPlace && live.cards.some(c=>c.id===card.id&&c.placed)) {
        sync.send('select',{card:card.id},live);
      } else panel.open('preview',{card});
    });
    $('board-title').textContent = r?.topic || (r?.mode===3 && r.phase!=='topic' ? 'お題は？' : MODES[s.settings.mode]);
    $('board-title').title = r?.topic ?? '';
    if (r) showProgress(progress(r),r.total,$('progress'),$('progress-bar'));
    else {
      $('progress').textContent = `${s.players.filter(p=>p.online).length} / 10 人`;
      $('progress-bar').style.width = '0%';
    }
    showLife(r,$('life'));
    const watching = s.players.find(p=>p.id===s.me)?.spectator;
    $('phase-label').textContent = (watching?'観戦中 · ':'')+({
      topic:'お題決め',input:'カード入力',placement:'Tierを選択',vote:'投票中',
      turnResult:'カード判定',attemptResult:'回答判定',oral:'お題の推理',result:'ラウンド結果',
    }[r?.phase] ?? '参加者を待っています');
    deck(s);
  }
  panel.render();
}
function deck(s) {
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
  const nextRound = () => {
    if (host) {
      add('同じ設定で次のラウンド',()=>send('start'),'primary').disabled=Boolean(s.startProblem);
      add('設定に戻る',async ()=>{
        if (await send('lobby')) panel.open('settings');
      });
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
    line(r.mode===1?short(r.turn)+'さんが入力中です。':'子が秘密Tierに沿って単語を入力しています。');
  } else if (r.phase==='placement' || r.phase==='vote') {
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
          if (r.mode===1) panel.open('confirm',{tier});
          else send('place',{tier,card:r.current.id});
        },'choice');
        b.style.setProperty('--tier',COLORS[tier]);
        b.setAttribute('aria-label',tier+'に配置');
        b.disabled = r.excluded.includes(tier);
        choices.append(b);
      }
    }
    if (r.canSubmit) add('回答を提出',()=>panel.open('submit'),'primary');
  } else if (r.phase==='turnResult') {
    const f=r.feedback;
    label(f.correct?'正解！':'不正解');
    line(f.word+' · 提案 '+f.tier+(f.answer?' ／ 正解 '+f.answer:' ／ 同じカードで再挑戦'));
    if (host) add(r.fixed===r.total?'結果へ':f.answer?'次へ':'再挑戦',()=>send('next'),'primary');
  } else if (r.phase==='attemptResult') {
    label('回答の判定');
    line(`正解は ${r.feedback.score} / ${r.total} 枚 · 提出 ${r.attempts} 回`);
    if (host) add(r.feedback.done?'結果へ':'再挑戦',()=>send('next'),'primary');
  } else if (r.phase==='oral') {
    label('口頭で回答');
    line(short(r.parent)+'さんがTier表からお題を当てます。');
    if (r.canJudge) add('正誤を判定',()=>panel.open('judge'),'primary');
  } else if (r.phase==='result') {
    label(r.result.win?'クリア！':'ラウンド終了 · 失敗');
    line(resultSummary({...r,correctCount:r.feedback?.score,
      target:s.settings.mode2Rule==='accuracy' ? s.settings.mode2Target : null}));
    if (r.mode===1 && r.history.length) add('誤答の詳細',()=>panel.open('history'));
    if (host && s.startProblem) line(s.startProblem);
    nextRound();
  }
}
render();
