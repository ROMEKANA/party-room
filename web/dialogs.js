import {MODES} from './config.js';
import {$,button,el,short} from './board.js';

export function dialogs(getState,send) {
  const overlay = $('overlay'), dialog = $('dialog');
  let panel = null, lastKey = '', problem = '', tab = 0;
  function automatic(s) {
    const r = s?.round;
    if (!r) return null;
    if (r.phase==='topic' && r.setter===s.me) return {kind:'topic'};
    if (r.input) return {kind:'input'};
    if (r.vote) return {kind:'vote'};
    return null;
  }
  function open(kind, data = {}) {
    const r = getState()?.round;
    panel = {kind,data,round:r?.id,version:r?.version};
    tab = 0;
    problem = '';
    render(true);
  }
  function close() {
    panel = null;
    problem = '';
    render(true);
  }
  function error(message) {
    problem = message;
    const line = $('dialog-error');
    if (line) line.textContent = message;
    return !overlay.hidden;
  }
  function render(force = false) {
    const s = getState(), r = s?.round;
    if (!s || (panel && !['settings','rules','menu'].includes(panel.kind) &&
        (panel.round!==r?.id || panel.version!==r?.version))) panel = null;
    const active = panel ?? automatic(s);
    const kind = active?.kind;
    const key = JSON.stringify([kind,active?.data,r?.id,
      ['settings','rules','menu'].includes(kind) ? null : r?.version,r?.input?.id,
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
    dialog.replaceChildren();
    if (!active) return;
    problem = '';
    const titles = {settings:'ゲーム設定',rules:'遊び方',menu:'ルームメニュー',
      input:'単語を提出',topic:'お題を決める',vote:'配置に投票',confirm:'配置を確認',
      preview:'カード詳細',history:'誤答の詳細',end:'ゲームを途中終了',leave:'ルームから退出',
      submit:'回答を提出',judge:'お題の回答を判定',player:'プレイヤー操作'};
    const head = el('div','modal-head');
    const title = el('h2','',titles[kind]);
    title.id = 'dialog-title';
    head.append(title);
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
    const actions = (...buttons) => {
      const line = el('div','action-row');
      line.append(...buttons);
      body.append(line);
    };
    const text = (value,cls = 'dialog-copy') => body.append(el('p',cls,value));
    if (kind==='input' || kind==='topic') {
      if (kind==='topic' && s.settings.topicSource==='random') {
        text(r.candidate,'dialog-word');
        actions(button('引き直す',()=>act('reroll')),button('このお題で確定',()=>act('topic'),'primary'));
      } else {
        const input = el('input');
        input.type = 'text';
        input.maxLength = 120;
        input.dataset.key = String(r.input?.id ?? r.id);
        input.value = drafts.get(input.dataset.key) ?? '';
        input.autocomplete = 'off';
        input.setAttribute('aria-label',kind==='input'?'単語':'お題');
        if (kind==='input') {
          text(r.topic);
          text('あなたの秘密Tier  '+r.input.tier,'secret-tier');
        }
        const form = el('form','input-form');
        const submit = el('button','primary',kind==='input'?'提出':'お題を確定');
        const validate = () => {submit.disabled = !input.value.trim() || [...input.value.trim()].length>60;};
        validate();
        input.oninput = () => {
          drafts.set(input.dataset.key,input.value);
          validate();
          error('');
        };
        form.onsubmit = async event => {
          event.preventDefault();
          if (submit.disabled) return;
          const ok = await act(kind==='input'?'word':'topic',{card:r.input?.id,word:input.value});
          if (ok) drafts.delete(input.dataset.key);
        };
        form.append(input,submit);
        body.append(form);
        if (focused) input.focus({preventScroll:true});
      }
    } else if (kind==='vote') {
      text('「'+r.current.word+'」 → '+r.proposal.tier,'dialog-word');
      text('投票対象の半数以上がGoodで承認');
      actions(button('👍 Good',()=>act('vote',{proposal:r.proposal.id,choice:'good'}),'vote good'),
        button('👎 Bad',()=>act('vote',{proposal:r.proposal.id,choice:'bad'}),'vote bad'));
    } else if (kind==='confirm') {
      text('「'+r.current.word+'」を '+active.data.tier+' で提出しますか？','dialog-word');
      actions(button('キャンセル',close),button('確定',()=>done('propose',{card:r.current.id,tier:active.data.tier}),'primary'));
    } else if (kind==='preview') {
      const c = active.data.card;
      text(c.word,'dialog-word');
      text([c.owner,c.placed?'配置 '+c.placed:'',c.answer?'正解 '+c.answer:''].filter(Boolean).join(' ／ '));
      actions(button('閉じる',close,'primary'));
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
      settings(body,s,tab,i=>{tab=i;render(true);},patch=>act('settings',{settings:patch}));
    } else if (kind==='rules') {
      const pages = [
        ['共通','上のTierほどお題に強く当てはまります。秘密のTierやお題は口頭で明かさず、選んだ理由は話して構いません。ゲームに制限時間はありません。'],
        ['みんなでTier表','手番の人が秘密Tierに沿って単語を出します。他の人が配置を提案し、投票対象の半数以上がGoodで判定。間違えるとライフが減ります。'],
        ['親がTierを当てる','子がカードを提出し、親がTierを当てます。置いたカードをタップすると再配置できます。完璧モードは全問正解、正答率モードは設定した割合を目指します。'],
        ['親がお題を当てる','子が提出するたびに正解Tierへカードが加わります。親は完成した表を見て口頭で回答し、お題の担当者が判定します。'],
      ];
      actions(...pages.map((_,i)=>button(i===0?'共通':String(i),()=>{tab=i;render(true);},i===tab?'selected control':'control')));
      text(pages[tab][0],'dialog-word');
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
      const focusable = [...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)'),
        ...document.querySelectorAll('#nav button')];
      const index = focusable.indexOf(document.activeElement);
      if (index===-1 || (e.shiftKey ? index===0 : index===focusable.length-1)) {
        e.preventDefault();
        focusable[e.shiftKey?focusable.length-1:0]?.focus();
      }
    }
  });
  return {open,render,error,close};
}
function settings(body,s,tab,onTab,change) {
  const editable = s.host===s.me && !s.round;
  const st = s.settings;
  const tabs = el('div','action-row');
  ['基本','モード','詳細'].forEach((name,i)=>tabs.append(button(name,()=>onTab(i),i===tab?'selected control':'control')));
  body.append(tabs,el('p','dialog-copy',editable?'ホストが変更できます。':s.round?'進行中のため閲覧のみ。':'待機中のホストが変更できます。'));
  const range = (n,step=1) => Array.from({length:n},(_,i)=>(i+1)*step);
  const select = (title,key,options) => {
    const label = el('label','setting-row',title), input = el('select');
    options.forEach((option,i)=>{
      const [value,caption] = Array.isArray(option)?option:[option,option];
      const node = el('option','',caption);
      node.value = i;
      node.selected = Object.is(st[key],value);
      input.append(node);
    });
    input.disabled = !editable;
    input.onchange = async () => {
      const option = options[input.selectedIndex];
      input.disabled = true;
      const ok = await change({[key]:Array.isArray(option)?option[0]:option});
      if (!ok && input.isConnected) {
        input.selectedIndex = options.findIndex(o=>Object.is(Array.isArray(o)?o[0]:o,st[key]));
        input.disabled = !editable;
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
    if (st.mode===1) {
      select('ライフ','mode1Lives',range(30));
      select('不正解時','mode1Wrong',[['reveal','正解を公開'],['retry','同じカードで再挑戦']]);
      if (st.difficulty==='hard') select('端Tierの出現順を制限','edgePrerequisites',[[true,'ON'],[false,'OFF']]);
    } else {
      if (st.mode===2) {
        select('勝利条件','mode2Rule',[['perfect','完璧モード'],['accuracy','正答率モード']]);
        if (st.mode2Rule==='perfect') select('回答提出上限','mode2Attempts',range(10));
        else select('目標正答率','mode2Target',range(10,10).map(n=>[n,n+'%']));
      } else body.append(el('p','dialog-copy','ライフは1回です。'));
      const players = s.players.filter(p=>p.online || p.id===st.nominatedParent);
      select('次の親','nominatedParent',[[null,'ランダム一巡'],...players.map(p=>[p.id,short(p.id)])]);
    }
  } else {
    select('Tier抽選','randomMode',[['random','完全ランダム'],['balanced','できるだけ均等'],['centerWeighted','真ん中多め']]);
    select('お題','topicSource',[['random','内蔵お題'],['custom','自由入力']]);
    body.append(el('p','dialog-copy','制限時間は無制限です。'));
  }
}
