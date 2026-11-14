import {DEFAULTS,MODES} from './config.js';
import {$,button,cardDescription,el,fit,short} from './board.js';
import {historyDetail,historyList} from './history.js';
import {releaseHistory} from './releases.js';

export function dialogs(getState,send,loadHistory) {
  const overlay = $('overlay'), dialog = $('dialog'), peekButton = $('peek-board');
  let panel = null, lastKey = '', problem = '', tab = 0;
  let heldPointer = null, heldKey = null;
  let historyTimer;
  const historyBoard = new ResizeObserver(entries=>entries.forEach(({target})=>fit(target)));
  const stablePanels = ['settings','rules','menu','roundHistory','resetHistory'];
  const refreshOnReturn = () => {
    if (!document.hidden && panel?.kind === 'roundHistory') refreshHistory(panel);
  };
  document.addEventListener('visibilitychange',refreshOnReturn);

  async function refreshHistory(view) {
    const request = Symbol();
    view.request = request;
    const id = view.selected;
    try {
      const {at,record} = await loadHistory(id);
      if (panel !== view || view.request !== request) return;
      view.error = '';
      if (id) view.record = record;
      else {
        view.scrollTop = dialog.querySelector('.history-list')?.scrollTop ?? view.scrollTop;
        view.list = record;
      }
      const next = id ? record.expiresAt : Math.min(...record.map(item=>item.expiresAt));
      clearTimeout(historyTimer);
      if (Number.isFinite(next)) {
        historyTimer = setTimeout(()=>{
          if (panel !== view) return;
          if (view.selected) {
            backToHistory(view);
            return;
          }
          const earliest = Math.min(...view.list.map(item=>item.expiresAt));
          view.list = view.list.filter(item=>item.expiresAt > earliest);
          render(true);
          refreshHistory(view);
        },Math.max(0,next-at));
      }
    } catch (error) {
      if (panel !== view || view.request !== request) return;
      if (error.code === 'historyExpired') {
        backToHistory(view);
        return;
      }
      view.error = '履歴を取得できませんでした。';
    }
    if (panel === view) render(true);
  }
  function backToHistory(view) {
    clearTimeout(historyTimer);
    view.selected = null;
    view.record = view.card = null;
    view.error = '';
    view.list = null;
    render(true);
    refreshHistory(view);
  }

  function stopPeeking() {
    const pointer = heldPointer;
    heldPointer = heldKey = null;
    overlay.classList.remove('peeking');
    if (pointer !== null && peekButton.hasPointerCapture(pointer)) peekButton.releasePointerCapture(pointer);
  }
  peekButton.addEventListener('pointerdown',event=>{
    if (event.button !== 0 || heldPointer !== null) return;
    event.preventDefault();
    heldPointer = event.pointerId;
    peekButton.setPointerCapture(heldPointer);
    overlay.classList.add('peeking');
  });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) {
    peekButton.addEventListener(type,event=>{
      if (event.pointerId === heldPointer) stopPeeking();
    });
  }
  peekButton.addEventListener('contextmenu',event=>event.preventDefault());
  peekButton.addEventListener('keydown',event=>{
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (event.repeat) return;
    heldKey = event.key;
    overlay.classList.add('peeking');
  });
  peekButton.addEventListener('keyup',event=>{
    if (event.key !== heldKey) return;
    event.preventDefault();
    stopPeeking();
  });
  peekButton.addEventListener('blur',()=>{if (heldKey !== null) stopPeeking();});
  window.addEventListener('blur',stopPeeking);
  document.addEventListener('visibilitychange',()=>{if (document.hidden) stopPeeking();});
  function automatic(s) {
    const r = s?.round;
    if (!r) return null;
    if (r.phase==='topic' && r.setter===s.me) return {kind:'topic'};
    if (r.input) return {kind:'input'};
    if (r.vote) return {kind:'vote'};
    return null;
  }
  function open(kind, data = {}) {
    clearTimeout(historyTimer);
    const s = getState(), r = s?.round;
    panel = {kind,data,round:r?.id,version:r?.version};
    tab = 0;
    problem = '';
    if (kind === 'roundHistory') {
      panel.historyVersion = s.historyVersion;
      refreshHistory(panel);
    }
    render(true);
  }
  function close() {
    clearTimeout(historyTimer);
    const trigger = panel?.kind === 'releaseHistory' ? $(panel.data.trigger) : null;
    panel = null;
    problem = '';
    render(true);
    if (trigger) (trigger.hidden ? $('brand-version') : trigger).focus({preventScroll:true});
  }
  function error(message) {
    problem = message;
    const line = $('dialog-error');
    if (line) line.textContent = message;
    return !overlay.hidden;
  }
  function render(force = false) {
    const s = getState(), r = s?.round;
    const releasesOpen = panel?.kind === 'releaseHistory';
    if (!releasesOpen && (!s || (panel && !stablePanels.includes(panel.kind) &&
        (panel.round!==r?.id || panel.version!==r?.version)))) panel = null;
    if (panel?.kind === 'roundHistory' && panel.historyVersion !== s.historyVersion) {
      panel.historyVersion = s.historyVersion;
      refreshHistory(panel);
    }
    const active = panel ?? automatic(s);
    const kind = active?.kind;
    const canPeek = kind==='input' && (s.settings.peekBoardWhileTyping ?? DEFAULTS.peekBoardWhileTyping);
    if (!canPeek || peekButton.dataset.card !== r?.input?.id) stopPeeking();
    peekButton.dataset.card = canPeek ? r.input.id : '';
    peekButton.hidden = !canPeek;
    overlay.classList.toggle('has-peek',canPeek);
    const historyOpen = kind === 'roundHistory';
    const key = releasesOpen ? kind : JSON.stringify([kind,active?.data,historyOpen ? null : r?.id,
      stablePanels.includes(kind) ? null : r?.version,historyOpen ? null : r?.input?.id,
      kind==='settings'?[s?.settings,s?.host,r?.phase,tab===1?s?.players.map(p=>[p.id,p.online]):null]:null,
      kind==='menu'?[s?.host,s?.players.map(p=>[p.id,p.online]),r?.phase]:null]);
    if (!force && key===lastKey) return;
    const oldInput = dialog.querySelector('input[type=text]');
    const preserve = oldInput && oldInput.dataset.key === String(r?.input?.id ?? r?.id);
    const draft = preserve ? oldInput.value : '';
    const focused = preserve && oldInput===document.activeElement;
    if (preserve) drafts.set(oldInput.dataset.key,draft);
    lastKey = key;
    overlay.hidden = !active;
    historyBoard.disconnect();
    dialog.classList.toggle('history-dialog',historyOpen);
    dialog.classList.toggle('history-detail',historyOpen && Boolean(active.selected));
    dialog.classList.toggle('release-dialog',releasesOpen);
    dialog.replaceChildren();
    if (!active) return;
    problem = '';
    const titles = {releaseHistory:'アップデート履歴',settings:'ゲーム設定',rules:'遊び方',menu:'ルームメニュー',
      input:'単語を提出',topic:'お題を決める',vote:'配置に投票',confirm:'配置を確認',
      preview:'カード詳細',history:'誤答の詳細',roundHistory:active.record?'履歴の結果':'履歴',resetHistory:'履歴をリセット',end:'ゲームを途中終了',leave:'ルームから退出',
      submit:'回答を提出',judge:'お題の回答を判定',player:'プレイヤー操作'};
    const head = el('div','modal-head');
    const title = el('h2','',titles[kind]);
    title.id = 'dialog-title';
    head.append(title);
    if (historyOpen && active.selected) {
      head.append(button('一覧に戻る',()=>backToHistory(active)));
    }
    if (panel) {
      const x = button('×',close,'icon-button');
      x.setAttribute('aria-label','閉じる');
      head.append(x);
    }
    dialog.append(head);
    const body = el('div','dialog-body');
    const alert = el('p','error',problem);
    alert.id = 'dialog-error';
    alert.setAttribute('role','alert');
    dialog.append(body,alert);
    const act = (type, fields = {}) => send(type,fields,r);
    const done = async (type,fields = {}) => {if (await act(type,fields)) close();};
    const actionRow = (...buttons) => {
      const line = el('div','action-row');
      line.append(...buttons);
      return line;
    };
    const actions = (...buttons) => body.append(actionRow(...buttons));
    const text = (value,cls = 'dialog-copy') => body.append(el('p',cls,value));
    if (releasesOpen) {
      releaseHistory(body);
      head.querySelector('button').focus({preventScroll:true});
    } else if (kind==='input' || kind==='topic') {
      const isTopic = kind==='topic';
      const input = el('input');
      input.type = 'text';
      input.maxLength = 120;
      input.dataset.key = String(r.input?.id ?? r.id);
      input.value = drafts.get(input.dataset.key) ?? '';
      input.autocomplete = 'off';
      input.setAttribute('aria-label',isTopic?'自分で入力':'単語');
      if (isTopic) {
        const random = el('section','topic-random');
        random.append(el('h3','topic-label','用意されたお題から'),el('p','dialog-word',r.candidate),
          actionRow(button('引き直す',()=>act('reroll')),
            button('このお題で確定',()=>act('topic',{source:'random'}),'primary')));
        body.append(random);
      } else {
        text(r.topic);
        text('あなたの秘密Tier  '+r.input.tier,'secret-tier');
      }
      const form = el('form','input-form'+(isTopic?' topic-custom':''));
      const submit = el('button','primary',isTopic?'入力したお題で確定':'提出');
      const validate = () => {submit.disabled = !input.value.trim() || [...input.value.trim()].length>60;};
      validate();
      input.oninput = () => {
        drafts.set(input.dataset.key,input.value);
        validate();
        error('');
      };
      form.onsubmit = async event => {
        event.preventDefault();
        if (submit.disabled || overlay.classList.contains('peeking')) return;
        const word = input.value;
        const ok = await (isTopic ? act('topic',{source:'custom',word}) : act('word',{card:r.input.id,word}));
        if (ok) drafts.delete(input.dataset.key);
      };
      if (isTopic) form.append(el('h3','topic-label','自分で入力'));
      form.append(input,submit);
      body.append(form);
      if (focused) input.focus({preventScroll:true});
    } else if (kind==='vote') {
      text('「'+r.current.word+'」 → '+r.proposal.tier,'dialog-word');
      text('Goodが過半数で可決');
      actions(button('👍 Good',()=>act('vote',{proposal:r.proposal.id,choice:'good'}),'vote good'),
        button('👎 Bad',()=>act('vote',{proposal:r.proposal.id,choice:'bad'}),'vote bad'));
    } else if (kind==='confirm') {
      text('「'+r.current.word+'」を '+active.data.tier+' で提出しますか？','dialog-word');
      actions(button('キャンセル',close),button('確定',()=>done('propose',{card:r.current.id,tier:active.data.tier}),'primary'));
    } else if (kind==='preview') {
      const c = active.data.card;
      text(c.word,'dialog-word');
      text(cardDescription(c));
      actions(button('閉じる',close,'primary'));
    } else if (kind==='roundHistory') {
      if (active.error) {
        text(active.error,'error');
        actions(button('再読み込み',()=>refreshHistory(active)));
      } else if (active.selected && active.record) {
        historyDetail(body,active.record,s.me,active.card,card=>{
          active.card = active.card?.id === card.id ? null : card;
          render(true);
          dialog.querySelector('.history-card')?.scrollIntoView({block:'nearest'});
          dialog.querySelector('.tile[aria-pressed=true]')?.focus({preventScroll:true});
        });
        historyBoard.observe(body.querySelector('.history-board'));
      } else if (!active.selected && active.list?.length) {
        historyList(body,active.list,(id,scrollTop)=>{
          active.scrollTop = scrollTop;
          active.selected = id;
          active.error = '';
          clearTimeout(historyTimer);
          render(true);
          refreshHistory(active);
        },active.scrollTop ?? 0);
      } else {
        text(!active.selected && active.list ? '直近30分の履歴はありません。' : '履歴を読み込み中…');
      }
    } else if (kind==='resetHistory') {
      text('このルームの履歴をすべて削除しますか？');
      actions(button('キャンセル',()=>{open('settings');tab=2;render(true);}),
        button('すべて削除',async()=>{
          if (await act('resetHistory')) {open('settings');tab=2;render(true);}
        },'control danger'));
    } else if (kind==='history') {
      const miss = r.history[tab];
      text(miss.word,'dialog-word');
      text('提案 '+miss.tier+' ／ 正解 '+miss.answer);
      const prev = button('前へ',()=>{tab--;render(true);});
      const next = button('次へ',()=>{tab++;render(true);});
      prev.disabled = tab===0;
      next.disabled = tab===r.history.length-1;
      text((tab+1)+' / '+r.history.length);
      actions(prev,next);
    } else if (kind==='end' || kind==='leave' || kind==='submit') {
      text({end:'このラウンドを終了し、全員を待機画面に戻します。',leave:'ルームから退出しますか？',
        submit:'現在のTier表で回答を提出しますか？'}[kind]);
      actions(button('キャンセル',close),button({end:'途中終了',leave:'退出',submit:'回答を提出'}[kind],()=>done(kind),'primary'));
    } else if (kind==='judge') {
      text(r.topic,'dialog-word');
      text('親の口頭回答を聞いてから判定してください。');
      actions(button('不正解',()=>done('judge',{win:false})),button('正解',()=>done('judge',{win:true}),'primary'));
    } else if (kind==='settings') {
      settings(body,s,tab,i=>{tab=i;render(true);},patch=>act('settings',{settings:patch}),()=>open('resetHistory'));
      if (s.host===s.me) body.append(button('決定',close,'primary settings-done'));
    } else if (kind==='rules') {
      const pages = [
        ['共通','上のTierほどお題に強く当てはまります。秘密のTierやお題は口頭で明かさず、選んだ理由は話して構いません。'],
        [MODES[1],'手番の人が秘密Tierに沿って単語を出し、他の人が配置を提案します。Goodが過半数で可決され、配置が合っているか判定します。間違えるとライフが減ります。得点ONの場合、可決されて正解すると、記入者にGoodの数だけ、Goodを押した人にそれぞれ1点が入ります。否決・不正解で点は変わりません。得点はラウンド終了時に表示されます。'],
        [MODES[2],'子がカードを提出し、親がTierを当てます。置いたカードをタップすると再配置できます。完璧モードは全問正解を目指し、不正解の提出ごとにライフが1つ減ります。正答率モードは1回の提出で、設定した正答率を目指します。'],
        [MODES[3],'子が提出するたびに正解Tierへカードが加わります。親は完成した表を見て口頭で回答し、お題の担当者が判定します。'],
      ];
      const tabs = el('div','action-row rule-tabs');
      tabs.append(...pages.map(([name],i)=>button(name,()=>{tab=i;render(true);},i===tab?'selected control':'control')));
      body.append(tabs);
      text(pages[tab][1]);
    } else if (kind==='menu') {
      text('参加名  '+s.me);
      const controls = [button(r?'退出':'退出・名前変更',()=>open('leave'))];
      if (s.host===s.me && r) controls.push(button('途中終了',()=>open('end')));
      actions(...controls);
      if (s.host===s.me) {
        const choices = el('div','member-grid');
        for (const p of s.players.filter(p=>p.online&&p.id!==s.me)) choices.append(button(short(p.id),()=>open('player',{id:p.id})));
        if (choices.childElementCount) {
          text('権限を譲渡する相手'+(r?'':'・キックする相手'));
          body.append(choices);
        }
      }
    } else if (kind==='player') {
      text(active.data.id,'dialog-word');
      const controls = [button('ホスト権限を譲渡',()=>done('transfer',{player:active.data.id}),'primary')];
      if (!r) controls.push(button('キック',()=>done('kick',{player:active.data.id})));
      actions(...controls);
    }
  }
  const drafts = new Map();
  document.addEventListener('keydown',e=>{
    if (e.key==='Escape' && panel) close();
    if (e.key==='Tab' && !overlay.hidden) {
      const focusable = [...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')];
      if (panel?.kind !== 'releaseHistory') {
        if (!peekButton.hidden) focusable.push(peekButton);
        if (!$('nav').hidden) focusable.push(...$('nav').querySelectorAll('button'));
      }
      const index = focusable.indexOf(document.activeElement);
      if (index===-1 || (e.shiftKey ? index===0 : index===focusable.length-1)) {
        e.preventDefault();
        focusable[e.shiftKey?focusable.length-1:0]?.focus();
      }
    }
  });
  return {open,render,error,close};
}
function settings(body,s,tab,onTab,change,resetHistory) {
  const editable = s.host===s.me && !s.round;
  const st = s.settings;
  const tabs = el('div','action-row');
  ['基本','モード','詳細'].forEach((name,i)=>tabs.append(button(name,()=>onTab(i),i===tab?'selected control':'control')));
  body.append(tabs,el('p','dialog-copy',editable?'ホストが変更できます。':s.round?'進行中のため閲覧のみ。':'待機中のホストが変更できます。'));
  const range = (n,step=1) => Array.from({length:n},(_,i)=>(i+1)*step);
  const select = (title,key,options,available = true) => {
    const label = el('label','setting-row',title), input = el('select');
    options.forEach((option,i)=>{
      const [value,caption] = Array.isArray(option)?option:[option,option];
      const node = el('option','',caption);
      node.value = i;
      node.selected = Object.is(st[key] ?? null,value);
      input.append(node);
    });
    input.disabled = !editable || !available;
    label.classList.toggle('unavailable',!available);
    input.onchange = async () => {
      const option = options[input.selectedIndex];
      input.disabled = true;
      const ok = await change({[key]:Array.isArray(option)?option[0]:option});
      if (!ok && input.isConnected) {
        input.selectedIndex = options.findIndex(o=>Object.is(Array.isArray(o)?o[0]:o,st[key] ?? null));
        input.disabled = !editable || !available;
      }
    };
    label.append(input);
    body.append(label);
  };
  if (tab===0) {
    select('モード','mode',Object.entries(MODES).map(([id,name])=>[Number(id),name]));
    select('難易度','difficulty',[['easy','簡単・3段階'],['normal','普通・5段階'],['hard','難しい・7段階']]);
    select('1人あたりの枚数','cardsPerPlayer',range(10));
  } else if (tab===1) {
    const playerOptions = (key,excluded = null) => s.players
      .filter(p=>(p.online || p.id===st[key]) && p.id!==excluded)
      .map(p=>[p.id,p.id]);
    if (st.mode===1) {
      select('ライフ','mode1Lives',range(30));
      select('得点','mode1Scoring',[[false,'OFF'],[true,'ON']]);
      select('不正解時','mode1Wrong',[['reveal','正解を公開'],['retry','同じカードで再挑戦']]);
      select('次のお題担当','nominatedMode1Setter',[[null,'ランダム一巡'],...playerOptions('nominatedMode1Setter')]);
    } else {
      if (st.mode===2) {
        select('勝利条件','mode2Rule',[['perfect','完璧モード'],['accuracy','正答率モード']]);
        if (st.mode2Rule==='perfect') select('回答提出上限','mode2Attempts',range(10));
        else select('目標正答率','mode2Target',range(10,10).map(n=>[n,n+'%']));
      } else body.append(el('p','dialog-copy','ライフは1回です。'));
      select('次の親','nominatedParent',[[null,'ランダム一巡'],...playerOptions('nominatedParent')]);
      const nominated = Boolean(st.nominatedParent);
      select('次のお題担当','nominatedSetter',
        [[null,nominated?'自動で決める':'親を指名すると選べます'],...playerOptions('nominatedSetter',st.nominatedParent)],
        nominated);
    }
    select('入力中にTier表を確認','peekBoardWhileTyping',[[true,'ON'],[false,'OFF']]);
  } else {
    select('Tier抽選','randomMode',[['random','完全ランダム'],['balanced','できるだけ均等'],['centerWeighted','真ん中多め']]);
    body.append(el('p','dialog-copy','どの方法でも、すべてのランクに必ず1枚以上入ります。'));
    const methods = el('dl','draw-help');
    for (const [method,meaning] of [
      ['完全ランダム','残りを各ランクに同じ確率で割り振ります。'],
      ['できるだけ均等','ランクごとの枚数の差を1枚以内にします。'],
      ['真ん中多め','残りは中央に近いランクほど当たりやすくなります。'],
    ]) methods.append(el('dt','',method),el('dd','',meaning));
    body.append(methods);
    if (st.mode===1 && st.difficulty==='hard') {
      select('端Tierの出現順を制限','edgePrerequisites',[[true,'ON'],[false,'OFF']]);
      body.append(el('p','dialog-copy','ONの場合、SSはSが、EはDが一度出てから登場します。配布枚数は変わりません。'));
    }
    if (s.host === s.me) body.append(button('履歴をリセット',resetHistory,'control danger'));
  }
}
