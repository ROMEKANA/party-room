import {holdButton} from './hold.js';
import {COLORS,DEFAULTS,MODES,hasParent,rightNeighbor} from './config.js';
import {playerDisplay} from './player-display.js';
import {$,button,cardDescription,el,fit} from './board.js';
import {consensusDetail} from './consensus.js';
import {historyDetail,historyList} from './history.js';
import {JOB_BATTLE,isBattle,CIRCLE,FOUR,NUMBER_CLASH,GAMES,GAME_IDS,HISTORY_MINUTES} from './games.js';
import {CIRCLE_RULES,circleSettings} from './circle.js';
import {BATTLE_RULES,JOB_BATTLE_RULES,battleSettings,jobDetails} from './battle.js';
import {NUMBER_RULES,numberSettings} from './number-clash.js';
import {FOUR_RULES,fourSettings} from './four.js';
import {gameCard} from './party.js';
import {releaseHistory} from './releases.js';

export function dialogs(getState,send,loadHistory) {
  const overlay = $('overlay'), dialog = $('dialog'), peekButton = $('peek-board');
  let panel = null, lastKey = '', problem = '', tab = 0;
  const turnStorageKey = 'tier-studio-acknowledged-turn';
  let acknowledgedTurn = sessionStorage.getItem(turnStorageKey);
  let historyTimer;
  const historyBoard = new ResizeObserver(entries=>entries.forEach(({target})=>fit(target)));
  const readingPanels = ['rules','ruleList','roundHistory','releaseHistory'];
  const stablePanels = ['settings','menu','resetHistory','gameList','commonSettings','playerManagement','battleJobDetail'];
  const refreshOnReturn = () => {
    if (!document.hidden && panel?.kind === 'roundHistory') refreshHistory(panel);
  };
  document.addEventListener('visibilitychange',refreshOnReturn);

  async function refreshHistory(view) {
    const request = Symbol();
    view.request = request;
    const id = view.selected;
    try {
      const {at,record} = await loadHistory(id,view.game);
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
    view.resultPlayer = null;
    view.error = '';
    view.list = null;
    render(true);
    refreshHistory(view);
  }

  const stopPeeking = holdButton(peekButton,held=>overlay.classList.toggle('peeking',held));
  function automatic(s) {
    const r = s?.round;
    if (!r) return null;
    if (r.phase==='topic' && r.setter===s.me) return {kind:'topic'};
    if (r.input) {
      const turn = JSON.stringify([r.id,r.input.id,s.me]);
      if (r.confirmTurn && acknowledgedTurn!==turn) return {kind:'confirmTurn',data:{turn}};
      return {kind:'input'};
    }
    if (r.vote) return {kind:'vote'};
    return null;
  }
  function open(kind, data = {}) {
    clearTimeout(historyTimer);
    const s = getState(), r = s?.round;
    panel = {kind,data,game:data.game ?? s?.game ?? null,scope:s?.scope,round:r?.id,version:r?.version,draftRevision:r?.draftRevision};
    tab = 0;
    problem = '';
    if (kind === 'roundHistory') {
      panel.historyVersion = s.historyVersion;
      panel.historyMinutes = s.common.historyMinutes;
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
    if (panel && panel.kind !== 'releaseHistory' && (!s ||
        (panel.scope !== s.scope && !readingPanels.includes(panel.kind)))) {
      clearTimeout(historyTimer);
      panel = null;
    }
    const releasesOpen = panel?.kind === 'releaseHistory';
    if (panel && ['move','submit'].includes(panel.kind) &&
        panel.draftRevision !== r?.draftRevision) panel = null;
    if (panel && !readingPanels.includes(panel.kind) && !stablePanels.includes(panel.kind) &&
        (panel.round!==r?.id || panel.version!==r?.version)) panel = null;
    if (panel?.kind === 'roundHistory' && (panel.historyVersion !== s.historyVersion || panel.historyMinutes !== s.common.historyMinutes)) {
      panel.historyVersion = s.historyVersion;
      panel.historyMinutes = s.common.historyMinutes;
      refreshHistory(panel);
    }
    const active = panel ?? automatic(s);
    const kind = active?.kind;
    const canPeek = kind==='input' && r.mode!==4 && (s.settings.peekBoardWhileTyping ?? DEFAULTS.peekBoardWhileTyping);
    if (!canPeek || peekButton.dataset.card !== r?.input?.id) stopPeeking();
    peekButton.dataset.card = canPeek ? r.input.id : '';
    peekButton.hidden = !canPeek;
    overlay.classList.toggle('has-peek',canPeek);
    const historyOpen = kind === 'roundHistory';
    const key = readingPanels.includes(kind) ? JSON.stringify([kind,active.game,active.data])
      : JSON.stringify([kind,active?.data,r?.id,
      stablePanels.includes(kind) ? null : r?.version,r?.input?.id,
      ['input','ownCards'].includes(kind) && r?.mode===4 ? r.ownCards : null,
      kind==='settings'?[s?.settings,s?.host,r?.phase,tab===1?s?.players.map(p=>[p.id,p.left]):null,
        s?.battle,s?.numberSettings,s?.fourSettings,isBattle(s?.game) || s?.game===FOUR ? s.players : null]:null,
      ['menu','playerManagement'].includes(kind)?[s?.host,s?.players.map(p=>[p.id,p.online,p.spectator,p.avatarId]),r?.phase]:null,
      kind==='gameList'?[s?.selectedGame,s?.host]:null,
      kind==='commonSettings'?[s?.common,s?.host]:null]);
    if (!force && key===lastKey) return;
    const oldInput = dialog.querySelector('input[type=text]');
    const preserve = oldInput && oldInput.dataset.key === String(active?.data?.card?.id ?? r?.input?.id ?? r?.id);
    const draft = preserve ? oldInput.value : '';
    const focused = preserve && oldInput===document.activeElement;
    if (preserve) drafts.set(oldInput.dataset.key,draft);
    lastKey = key;
    overlay.hidden = !active;
    historyBoard.disconnect();
    dialog.classList.toggle('history-dialog',historyOpen);
    dialog.classList.toggle('history-detail',historyOpen && Boolean(active.selected));
    dialog.classList.toggle('release-dialog',releasesOpen);
    dialog.classList.toggle('rules-dialog',kind==='rules');
    dialog.replaceChildren();
    if (!active) return;
    problem = '';
    const titles = {battleJobDetail:'職業と行動の詳細',releaseHistory:'アップデート情報',settings:'ゲーム設定',rules:active.data?.fromList ? GAMES[active.game].title+'の遊び方' : '遊び方',ruleList:'ゲームルール',menu:'ルームメニュー',
      input:'単語を提出',topic:'お題を決める',vote:'配置に投票',confirmTurn:'あなたの番です',
      preview:'カード詳細',move:'カード詳細',ownCards:'自分の投稿',editWord:'投稿を修正',history:'誤答の詳細',roundHistory:active.record?(active.card && active.record.mode===4?'カード詳細':'履歴の結果'):'対戦履歴',resetHistory:'履歴をリセット',end:'ゲームを途中終了',leave:'ルームから退出',
      submit:r?.mode===4?'最終確定':'回答を提出',judge:'お題の回答を判定',player:'プレイヤー操作',playerManagement:'プレイヤー管理',commonSettings:'共通設定',gameList:'ゲーム一覧',lobby:'ロビーに戻る',circleLog:'テーブルの記録'};
    const head = el('div','modal-head');
    const title = el('h2','',titles[kind]);
    title.id = 'dialog-title';
    head.append(title);
    if (historyOpen && active.selected) {
      if (active.card && active.record?.mode===4) head.append(button('Tier表に戻る',()=>{
        active.card = null;
        render(true);
      }));
      else head.append(button('一覧に戻る',()=>backToHistory(active)));
    }
    if (kind==='rules' && active.data.fromList) {
      head.append(button('一覧に戻る',()=>open('ruleList')));
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
    const ownCards = () => {
      if (!r.ownCards?.length) return;
      const list = el('div','own-cards consensus-scroll');
      for (const card of r.ownCards) list.append(button(card.answer+'  '+card.word,()=>open('editWord',{card})));
      body.append(list);
    };
    if (releasesOpen) {
      releaseHistory(body,active.game);
      head.querySelector('button').focus({preventScroll:true});
    } else if (kind==='gameList' || kind==='ruleList') {
      const choosingGame = kind==='gameList';
      const grid = el('div','game-list');
      for (const id of GAME_IDS) {
        const control = button('',()=>choosingGame ? done('browse',{choice:id}) :
          open('rules',{game:id,fromList:true}),'control game-card');
        control.append(...gameCard(id));
        if (choosingGame) {
          control.setAttribute('aria-pressed',String(id===s.selectedGame));
          control.disabled = s.host!==s.me;
        }
        grid.append(control);
      }
      body.append(grid);
    } else if (kind==='commonSettings') {
      const label = el('label','setting-row','対戦履歴の保存期間');
      const select = el('select');
      for (const minutes of HISTORY_MINUTES) {
        const option = el('option','',minutes===30?'30分':minutes===1440?'1日':minutes/60+'時間');
        option.value = minutes;
        option.selected = s.common.historyMinutes === minutes;
        select.append(option);
      }
      select.disabled = s.host!==s.me;
      select.onchange = async()=>{
        select.disabled = true;
        if (!await act('commonSettings',{minutes:Number(select.value)}) && select.isConnected) {
          select.value = s.common.historyMinutes;
          select.disabled = false;
        }
      };
      label.append(select);
      body.append(label);
    } else if (kind==='circleLog') {
      const list = el('ol','circle-log');
      for (const event of [...r.log].reverse()) list.append(el('li','',event));
      body.append(list);
    } else if (kind==='confirmTurn') {
      const ok = button('OK',()=>{
        acknowledgedTurn = active.data.turn;
        sessionStorage.setItem(turnStorageKey,acknowledgedTurn);
        render(true);
        dialog.querySelector('input')?.focus({preventScroll:true});
      },'primary');
      body.append(ok);
      ok.focus({preventScroll:true});
    } else if (kind==='ownCards') {
      ownCards();
    } else if (kind==='input' || kind==='topic' || kind==='editWord') {
      const isTopic = kind==='topic', editing = kind==='editWord';
      const edited = active.data?.card;
      const input = el('input');
      input.type = 'text';
      input.maxLength = 120;
      input.dataset.key = String(edited?.id ?? r.input?.id ?? r.id);
      input.value = drafts.get(input.dataset.key) ?? edited?.word ?? '';
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
        text((r.mode===4?'指定Tier  ':'あなたの秘密Tier  ')+(edited?.answer ?? r.input.tier),'secret-tier');
      }
      const form = el('form','input-form'+(isTopic?' topic-custom':''));
      const submit = el('button','primary',isTopic?'入力したお題で確定':editing?'修正する':'提出');
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
        const ok = await (isTopic ? act('topic',{source:'custom',word}) :
          act(editing?'editWord':'word',{card:edited?.id ?? r.input.id,word}));
        if (ok) {
          drafts.delete(input.dataset.key);
          if (editing) close();
        }
      };
      if (isTopic) form.append(el('h3','topic-label','自分で入力'));
      form.append(input,submit);
      body.append(form);
      if (kind==='input' && r.mode===4) ownCards();
      if (focused) input.focus({preventScroll:true});
    } else if (kind==='vote') {
      text('「'+r.current.word+'」 → '+r.proposal.tier,'dialog-word');
      text('Goodが過半数で可決');
      actions(button('👍 Good',()=>act('vote',{proposal:r.proposal.id,choice:'good'}),'vote good'),
        button('👎 Bad',()=>act('vote',{proposal:r.proposal.id,choice:'bad'}),'vote bad'));

    } else if (kind==='preview' || kind==='move') {
      const c = active.data.card;
      if (r?.mode===4 && r.phase==='result') {
        const detail = el('div','dialog-body consensus-scroll');
        consensusDetail(detail,r,c);
        body.append(detail);
      } else {
        text(c.word,'dialog-word');
        const description = cardDescription(c);
        if (description) text(description);
      }
      if (kind==='move') {
        const choices = el('div','placement-dialog-choices');
        choices.style.setProperty('--tier-count',s.tiers.length);
        for (const tier of s.tiers) {
          const choice = button(tier,()=>done('place',{card:c.id,tier}),'choice');
          choice.style.setProperty('--tier',COLORS[tier]);
          choice.setAttribute('aria-label',tier+'に移動');
          choice.disabled = tier===c.placed;
          choices.append(choice);
        }
        body.append(choices);
      }
      actions(button('閉じる',close,'primary'));
    } else if (kind==='roundHistory') {
      if (active.error) {
        text(active.error,'error');
        actions(button('再読み込み',()=>refreshHistory(active)));
      } else if (active.selected && active.record?.mode===4 && active.card) {
        const detail = el('div','dialog-body consensus-scroll');
        consensusDetail(detail,active.record,active.card);
        body.append(detail);
      } else if (active.selected && active.record) {
        historyDetail(body,active.record,s.me,active.card,card=>{
          active.card = active.card?.id === card.id ? null : card;
          render(true);
          dialog.querySelector('.history-card')?.scrollIntoView({block:'nearest'});
          dialog.querySelector('.tile[aria-pressed=true]')?.focus({preventScroll:true});
        },active.resultPlayer,player=>{active.resultPlayer=player;render(true);});
        const board = body.querySelector('.history-board');
        if (board) historyBoard.observe(board);
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
        text(!active.selected && active.list ? '保存されている対戦履歴はありません。' : '履歴を読み込み中…');
      }
    } else if (kind==='resetHistory') {
      text(s.game?'選択中のゲームの履歴をすべて削除しますか？':'すべてのゲームの履歴を削除しますか？');
      actions(button('キャンセル',()=>open('menu')),
        button('すべて削除',async()=>{
          if (await act('resetHistory')) open('roundHistory');
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
    } else if (kind==='end' || kind==='leave' || kind==='submit' || kind==='lobby') {
      const consensus = r?.mode===4;
      const leavingEarly = consensus && r.phase!=='result' && !r.final &&
        !s.players.find(p=>p.id===s.me)?.spectator;
      text({end:'このラウンドを終了し、全員を設定画面に戻します。',
        lobby:'進行中の対戦を終了し、全員をロビーに戻します。',
        leave:leavingEarly?'退出するとこの対戦は途中終了します。退出しますか？':'ルームから退出しますか？',
        submit:consensus?'このTier表で確定しますか？ 確定後は変更できません。':'現在のTier表で回答を提出しますか？'}[kind]);
      actions(button('キャンセル',close),button({end:'途中終了',lobby:'ロビーに戻る',leave:'退出',submit:consensus?'確定':'回答を提出'}[kind],()=>done(kind),'primary'));
    } else if (kind==='judge') {
      text(r.topic,'dialog-word');
      text('親の口頭回答を聞いてから判定してください。');
      actions(button('不正解',()=>done('judge',{win:false})),button('正解',()=>done('judge',{win:true}),'primary'));
    } else if (kind==='battleJobDetail') {
      jobDetails(body,active.data.player,active.data.action);
    } else if (kind==='settings' && (isBattle(s.game) || s.game===NUMBER_CLASH || s.game===FOUR)) {
      const tabs = el('div','action-row');
      ['基本','詳細'].forEach((label,i)=>tabs.append(button(label,()=>{tab=i;render(true);},i===tab?'selected control':'control')));
      body.append(tabs);
      if (s.game===NUMBER_CLASH) numberSettings(body,s,act,tab);
      else if (s.game===FOUR) fourSettings(body,s,act,tab);
      else battleSettings(body,s,act,tab);
      if (s.host===s.me) body.append(button('決定',close,'primary settings-done'));
    } else if (kind==='settings' && s.game===CIRCLE) {
      circleSettings(body,s);
    } else if (kind==='settings') {
      tierSettings(body,s,tab,i=>{tab=i;render(true);},patch=>act('settings',{settings:patch}),()=>open('resetHistory'));
      if (s.host===s.me) body.append(button('決定',close,'primary settings-done'));
    } else if (kind==='rules' && (isBattle(active.game) || active.game===CIRCLE || active.game===NUMBER_CLASH || active.game===FOUR)) {
      const rules = el('dl','circle-settings');
      for (const [name,description] of active.game===JOB_BATTLE ? JOB_BATTLE_RULES : isBattle(active.game) ? BATTLE_RULES : active.game===NUMBER_CLASH ? NUMBER_RULES : active.game===FOUR ? FOUR_RULES : CIRCLE_RULES) rules.append(el('dt','',name),el('dd','',description));
      body.append(rules);
    } else if (kind==='rules') {
      const pages = [
        ['共通','上のTierほどお題に強く当てはまります。秘密のTierやお題は口頭で明かさず、選んだ理由は話して構いません。'],
        [MODES[1],'手番の人が秘密Tierに沿って単語を出し、他の人が配置を提案します。Goodが過半数で可決され、配置が合っているか判定します。間違えるとライフが減ります。得点ONの場合、可決されて正解すると、記入者にGoodの数だけ、Goodを押した人にそれぞれ1点が入ります。否決・不正解で点は変わりません。得点はラウンド終了時に表示されます。'],
        [MODES[2],'子がカードを提出し、親がTierを当てます。置いたカードをタップすると再配置できます。提出するにはすべてのTierに1枚以上必要です。正答率モードは1回ごとの提出で目標正答率を、完全モードは全問正解を目指します。どちらも条件に届かない提出ごとにライフが1つ減り、残っていれば再挑戦できます。'],
        [MODES[3],'子が提出するたびに正解Tierへカードが加わります。親は完成した表を見て口頭で回答し、お題の担当者が判定します。'],
        [MODES[4],'全員が指定Tierに沿ってカードを投稿し、同じカードを使って各自でTier表を作ります。すべてのTierに1枚以上置いて確定します。全員がすべてのカードを同じTierに置くとクリアです。投稿時の指定Tierや同じTier内の並び順は判定に使いません。'],
      ];
      const tabs = el('div','action-row rule-tabs');
      tabs.append(...pages.map(([name],i)=>button(name,()=>{tab=i;render(true);},i===tab?'selected control':'control')));
      body.append(tabs);
      text(pages[tab][1]);
    } else if (kind==='menu') {
      text('参加名  '+s.me);
      const menu = el('div','member-grid menu-grid');
      const items = [
        ['♟ プレイヤー管理','playerManagement'],['▤ 対戦履歴','roundHistory'],
        ['↻ アップデート情報','releaseHistory'],['⚙ 共通設定','commonSettings'],['↪ 退出','leave'],
      ];
      items.unshift(['? ゲームルール',s.game?'rules':'ruleList']);
      if (s.game) items.splice(1,0,['⚙ ゲーム設定','settings']);
      if (s.game===CIRCLE && r) items.push(['≡ テーブルの記録','circleLog']);
      for (const [name,view] of items) menu.append(button(name,()=>open(view)));
      if (s.host===s.me) {
        menu.append(button('▤ 履歴をリセット',()=>open('resetHistory')));
        if (s.playing) menu.append(button('■ ゲーム途中終了',()=>open('end')));
        if (s.game) menu.append(button('⌂ ロビーに戻る',()=>s.playing?open('lobby'):done('lobby')));
      }
      body.append(menu);
    } else if (kind==='playerManagement') {
      const players = el('div','member-grid player-management-grid');
      for (const p of s.players.filter(p=>!p.left)) {
        const roles = [p.id === s.host ? 'ホスト' : '',p.spectator ? '観戦' : ''].filter(Boolean);
        const control = playerDisplay({...p,roles},{me:s.me,select:id=>open('player',{id})});
        control.disabled = s.host!==s.me || !p.online || p.id===s.me;
        players.append(control);
      }
      body.append(players);
      if (s.host===s.me && !r) body.append(button('プレイヤー順をシャッフル',()=>done('shuffle')));
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
export function tierSettings(body,s,tab,onTab,change,resetHistory) {
  const editable = s.host===s.me && !s.playing;
  const st = s.playing && s.tierRoundSettings ? s.tierRoundSettings : s.settings;
  if (onTab) {
    const tabs = el('div','action-row');
    ['基本','モード','詳細'].forEach((name,i)=>tabs.append(button(name,()=>onTab(i),i===tab?'selected control':'control')));
    body.append(tabs,el('p','dialog-copy',editable?'ホストが変更できます。':s.playing?'進行中のため閲覧のみ。':'ホストが変更できます。'));
  } else body.append(el('h2','setup-heading',tab===0?'基本設定':'モード設定'));
  const range = (n,step=1) => Array.from({length:n},(_,i)=>(i+1)*step);
  const setOptions = (input,options,selected) => {
    input.replaceChildren();
    options.forEach((option,i)=>{
      const [value,caption] = Array.isArray(option)?option:[option,option];
      const node = el('option','',caption);
      node.value = i;
      node.selected = Object.is(selected,value);
      input.append(node);
    });
  };
  const select = (title,key,options,available = true,onPending) => {
    const label = el('label','setting-row',title), input = el('select');
    setOptions(input,options,st[key] ?? null);
    input.disabled = !editable || !available;
    label.classList.toggle('unavailable',!available);
    input.onchange = async () => {
      const option = options[input.selectedIndex];
      input.disabled = true;
      const value = Array.isArray(option) ? option[0] : option;
      onPending?.(value,true);
      const ok = await change({[key]:value});
      if (!ok && input.isConnected) {
        input.selectedIndex = options.findIndex(o=>Object.is(Array.isArray(o)?o[0]:o,st[key] ?? null));
        input.disabled = !editable || !available;
        onPending?.(st[key] ?? null,false);
      }
    };
    label.append(input);
    body.append(label);
    return input;
  };
  if (tab===0) {
    select('モード','mode',Object.entries(MODES).map(([id,name])=>[Number(id),name]));
    select('難易度','difficulty',[['easy','簡単・3段階'],['normal','普通・5段階'],['hard','難しい・7段階']]);
    select('1人あたりの枚数','cardsPerPlayer',range(10));
  } else if (tab===1) {
    const ids = s.players.filter(p=>!p.left).map(p=>p.id);
    const topicOptions = [[null,'ランダム'],...ids.map(id=>[id,id])];
    if (st.mode===1) {
      select('ライフ','mode1Lives',range(30));
      select('得点','mode1Scoring',[[false,'OFF'],[true,'ON']]);
      select('手番開始時に確認ダイアログを表示','mode1ConfirmTurn',[[false,'OFF'],[true,'ON']]);
      select('不正解時','mode1Wrong',[['reveal','正解を公開'],['retry','同じカードで再挑戦']]);
    }
    if (!hasParent(st.mode)) {
      select('次のお題担当','nominatedMode1Setter',topicOptions);
      if (st.mode===4) select('カードの投稿者を表示する','mode4ShowAuthors',[[false,'OFF'],[true,'ON']]);
    } else {
      if (st.mode===2) {
        select('勝利条件','mode2Rule',[['accuracy','正答率モード'],['perfect','完全モード']]);
        if (st.mode2Rule==='accuracy') select('目標正答率','mode2Target',range(10,10).map(n=>[n,n+'%']));
        select(st.mode2Rule==='accuracy'?'挑戦回数':'回答提出上限','mode2Attempts',range(10));
      } else body.append(el('p','dialog-copy','ライフは1回です。'));
      select('親にカードの記入者を表示',st.mode===2?'mode2ShowAuthors':'mode3ShowAuthors',[[true,'ON'],[false,'OFF']]);
      const parentOptions = setter => setter && ids.length > 1
        ? ids.filter(id=>id!==setter).map(id=>[id,id]) : [[null,'']];
      const setter = ids.includes(st.nominatedSetter) ? st.nominatedSetter : null;
      select('次のお題担当','nominatedSetter',topicOptions,true,(next,pending)=>{
        setOptions(parent,parentOptions(next),pending ? rightNeighbor(ids,next) : st.nominatedParent);
        const available = Boolean(next && ids.length > 1);
        parent.disabled = pending || !editable || !available;
        parent.parentElement.classList.toggle('unavailable',!available);
      });
      const parent = select('次の親','nominatedParent',parentOptions(setter),Boolean(setter && ids.length > 1));
    }
    if (st.mode!==4) select('入力中にTier表を確認','peekBoardWhileTyping',[[true,'ON'],[false,'OFF']]);
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
    if (resetHistory && s.host === s.me) body.append(button('履歴をリセット',resetHistory,'control danger'));
  }
}
