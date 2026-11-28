import {setting} from './settings.js';
import {turnIsOpen,turnTimeFraction,turnTimeLabel} from './timed-turn.js';
import {button,el} from './board.js';
import {playerDisplay} from './player-display.js';
import {ACTIONS,BATTLE_CHOICES,BATTLE_MODES,BOSS_STATS,TEAM_NAMES,actionCost,actionTargets,availableActions,canUseAction} from './battle-rules.js';

import {JOB_BATTLE} from './games.js';
import {JOBS,JOB_BATTLE_FIXED,JOB_CANDIDATE_COUNT} from './battle-jobs.js';

export const BATTLE_RULES = [
  ['同時ターン制','全員が同時に行動を選びます。全員が選ぶか制限時間になると受付を締め切り、結果をまとめて公開します。未選択のときは溜めるになります。'],
  ['基本アクション','溜めるとエネルギー＋1。ガードは自分への攻撃を防ぎます。単体攻撃はエネルギー1で敵1人、全体攻撃は3で敵全員に1ダメージを与えます。'],
  ['攻撃の相殺','互いに攻撃した2人の間では攻撃を相殺します。敵同士が全体攻撃を選ぶと、そのターンは全員の攻撃が無効です。防御・相殺されてもエネルギーは消費します。'],
  ['被弾上限','防御や相殺のあと、有効な攻撃と反撃を被弾した人ごとに数えます。ダメージの大きい順に上限の件数まで採用し、同じダメージなら攻撃者IDの昇順です。「なし」ではすべて採用します。上限が1件でも、2ダメージの攻撃は2ダメージ入ります。'],
  ['バトルロイヤル','2〜10人で対戦します。最後まで生き残った1人が勝利します。'],
  ['チーム戦','同人数の2チームで対戦します。エネルギー1を味方に渡したり、味方への攻撃をかばったりできます。ガードとかばうは連続防御回数を共有します。'],
  ['ボス戦',`ボス1人とチーム側3人で対戦します。ボスの初期・最大HPは基本HPの${BOSS_STATS.hpMultiplier}倍で、溜めるとエネルギー＋${BOSS_STATS.charge}。単体攻撃はエネルギー${ACTIONS.strike.cost}で敵1人に${BOSS_STATS.strikeDamage}ダメージ、全体攻撃は${BOSS_STATS.sweepCost}で生存中の敵全員に各1ダメージです。チーム側には全体攻撃がありません。`],
  ['引き分け','全プレイヤー、または両チームが全滅すると引き分けです。'],
];

export const JOB_BATTLE_RULES = [
  ...BATTLE_RULES.filter(([title])=>title !== 'ボス戦'),
  ['職業を選ぶ',`全10職業からランダムに配られた${JOB_CANDIDATE_COUNT}候補のうち1つを確定します。全員が確定すると同時に公開されます。基本初期HPと最大HPは${JOB_BATTLE_FIXED.hp}、基本のエネルギー上限は${JOB_BATTLE_FIXED.energy}です。`],
  ...Object.values(JOBS).map(job=>[job.icon+' '+job.name,
    job.description+(job.action ? ' 消費エネルギー '+ACTIONS[job.action].cost+'。' : '')]),
];

const basicFields = {
  mode:'モード', hp:'初期HP', energy:'エネルギー上限', hitCap:'被弾上限',
  defenseLimit:'連続防御制限', seconds:'行動制限時間',
};
const detailFields = {
  readyMs:'ターン開始前の通信猶予', graceMs:'ターン終了時の通信猶予', resultMs:'ターン結果表示時間',
};
const formatSetting = (key,value) => value === null ? 'なし' :
  key === 'mode' ? BATTLE_MODES[value] : key === 'seconds' ? value+'秒' :
    key === 'defenseLimit' ? value+'回' : key === 'hitCap' ? value+'件' :
      key in detailFields ? value+'ms' : String(value);
const signed = value => value > 0 ? '+'+value : String(value);

export function battleSettings(root,s,send,tab = null) {
  const round = s.playing ? s.round : null;
  const {settings,teams} = round ? {
    settings:round.settings,
    teams:{
      pink:round.players.filter(p=>p.team === 'pink').map(p=>p.id),
      blue:round.players.filter(p=>p.team === 'blue').map(p=>p.id),
    },
  } : s.battle;
  const editable = s.host === s.me && !s.playing;
  const fields = (parent,labels) => {
    for (const [key,title] of Object.entries(labels)) {
      if (s.game === JOB_BATTLE && Object.hasOwn(JOB_BATTLE_FIXED,key)) continue;
      const options = BATTLE_CHOICES[key].filter(value=>s.game !== JOB_BATTLE || key !== 'mode' || value !== 'boss');
      parent.append(setting(title,key,options.map(value=>[value,formatSetting(key,value)]),
        settings[key],editable,send));
    }
  };
  if (tab === 1) {
    fields(root,detailFields);
    return;
  }
  const grid = el('div','setup-columns battle-setup');
  const left = el('section','setup-fields');
  const right = el('section','battle-mode-settings');
  left.append(el('h2','setup-heading','基本設定'));
  fields(left,basicFields);
  const players = round?.players ?? s.players.filter(p=>!p.spectator);
  if (settings.mode === 'teams') {
    const canSwap = editable && !s.round;
    let selected = null;
    const controls = new Map();
    const highlight = () => {
      for (const [id,control] of controls) control.setAttribute('aria-pressed',String(id === selected));
    };
    for (const team of ['pink','blue']) {
      const side = el('section','battle-team-setup battle-'+team);
      side.append(el('h2','setup-heading',TEAM_NAMES[team]));
      const members = el('div','battle-team-members');
      for (const id of teams[team]) {
        const player = players.find(p=>p.id === id);
        if (!player) continue;
        const choose = async () => {
          if (!selected || teams[team].includes(selected)) {
            selected = selected === id ? null : id;
            highlight();
          } else {
            const fields = team === 'pink' ? {pink:id,blue:selected} : {pink:selected,blue:id};
            if (await send('battleSwap',fields)) {
              selected = null;
              highlight();
            }
          }
        };
        const item = playerDisplay(player,{
          me:s.me,select:canSwap ? choose : null,selectionLabel:()=>id,
        });
        item.classList.add('battle-team-person');
        if (canSwap) controls.set(id,item);
        members.append(item);
      }
      side.append(members);
      right.append(side);
    }
    highlight();
    if (canSwap) right.append(button('ランダムチーム分け',()=>send('battleRandom')));
  } else if (settings.mode === 'boss') {
    right.classList.add('setup-fields');
    right.append(el('h2','setup-heading','ボス戦'),
      setting('ボス','bossId',[[null,'ランダム'],...players.map(p=>[p.id,p.id])],settings.bossId,editable,send));
    if (round) right.append(el('p','deck-message','今回のボス '+round.boss));
    else right.append(el('p','deck-message','ボスの初期・最大HP '+settings.hp*BOSS_STATS.hpMultiplier));
  }
  grid.append(left,right);
  root.append(grid);
  if (tab === null && s.startProblem) root.append(el('p','deck-message',s.startProblem));
}

export const battleOutcome = outcome => outcome.draw ? '引き分け' :
  (outcome.winner ?? TEAM_NAMES[outcome.team])+'の勝利';

function stat(icon,label,value,max,delta,animate) {
  const line = el('div','battle-stat '+label);
  const number = el('span','battle-number',icon+' '+value+'/'+max);
  number.setAttribute('aria-label',(label === 'battle-hp' ? 'HP ' : 'エネルギー ')+value+' / '+max);
  const track = el('span','battle-stat-track');
  const bar = el('span','battle-stat-bar');
  track.append(bar);
  line.append(number,track);
  bar.style.width = (value/max)*100+'%';
  if (animate && delta && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    bar.animate([{width:(value-delta)/max*100+'%'},{width:value/max*100+'%'}],{duration:240,easing:'ease-out'});
  }
  return line;
}

const effectNames = {hit:'命中',block:'防御',cancel:'相殺',capped:'被弾上限'};
const battleEffect = effect => effect.result === 'hit' && effect.amount > 1 ?
  effect.amount+'ダメージ' : effectNames[effect.result];
const legacyJobDescriptions = {
  warrior:'単体攻撃と全体攻撃のダメージが2倍になります。',
  fighter:'溜めるとエネルギーを2獲得します。',
};
const jobEffect = effect => ({
  hit:effect.amount+'ダメージ',block:'防御',cancel:'相殺',countered:'反撃で無効',
  counter:effect.amount ? '単体攻撃を無効・反撃 '+effect.amount+'ダメージ' : '単体攻撃を無効・反撃は被弾上限',
  capped:'被弾上限',heal:effect.amount ? 'HP＋'+effect.amount : 'HP変化なし',
  guardEnergy:effect.amount ? 'ガード成功 ⚡＋'+effect.amount : 'ガード成功',
  steal:'強奪 ⚡＋'+effect.amount,curse:'次ターンのガード禁止',
})[effect.result];

export function jobDetails(root,player,action) {
  const job = JOBS[player.job];
  const title = el('strong','',player.id+' ／ '+job.icon+' '+job.name);
  const description = job.description+(job.action ? ' 消費エネルギー '+actionCost(player,job.action)+'。' : '');
  root.append(title,el('p','dialog-copy',description),
    el('p','dialog-copy',`HP ${player.hp}/${player.maxHp} ／ ⚡${player.energy}/${player.maxEnergy}`+
      (player.cursed ? ' ／ 呪い（通常ガード不可）' : '')));
  if (!action) return;
  root.append(el('strong','',ACTIONS[action.kind].name));
  for (const effect of action.effects) root.append(el('p','dialog-copy',effect.target+' ／ '+jobEffect(effect)));
}


function effectText(effects) {
  if (effects.length === 1) return battleEffect(effects[0]);
  const counts = new Map();
  for (const {result} of effects) counts.set(result,(counts.get(result) ?? 0)+1);
  return Object.entries(effectNames).filter(([kind])=>counts.has(kind))
    .map(([kind,name])=>name+(effects.length > 1 ? counts.get(kind) : '')).join(' ');
}

export function battlePlayerMark(round,player) {
  if (['jobs','review','result'].includes(round.phase) || player.hp === 0 || !player.online) return null;
  return player.submitted ? 'done' : 'pending';
}

function playerCard(player,s,round,review,animate,onTarget) {
  const card = onTarget ? button('',()=>onTarget(player.id),'battle-card') : el('div','battle-card');
  card.classList.add('battle-'+(player.team ?? 'solo'));
  card.classList.toggle('battle-self',player.id === s.me);
  card.classList.toggle('battle-out',player.hp === 0);
  const last = round.previous?.actions;
  const action = last && Object.hasOwn(last,player.id) ? last[player.id] : null;
  const name = el('strong','battle-name',player.id);
  const job = JOBS[player.job];
  const jobDescription = player.maxEnergy === undefined ? legacyJobDescriptions[player.job] ?? job?.description :
    job?.description;
  const flag = player.hp === 0 ? '脱落' : !review && !player.online ? '切断' : '';
  const identity = el('div','battle-identity');
  identity.append(name);
  if (job) {
    const badge = el('span','battle-job-badge',job.icon);
    badge.title = [job.name,jobDescription].filter(Boolean).join(' ／ ');
    badge.setAttribute('aria-label',job.name);
    identity.append(badge);
    if (player.cursed) {
      const curse = el('span','battle-curse','呪');
      curse.setAttribute('aria-label','呪い・通常ガード不可');
      identity.append(curse);
    }
  }
  if (flag) identity.append(el('span','battle-card-status',flag));
  if (!review && action) {
    const icon = el('span','battle-last-icon',ACTIONS[action.kind].icon);
    icon.title = '前のターン '+ACTIONS[action.kind].name;
    identity.append(icon);
  }
  card.append(identity);
  card.append(stat('♥','battle-hp',player.hp,player.maxHp,action?.hpDelta,animate),
    stat('⚡','battle-energy',player.energy,player.maxEnergy ?? round.settings.energy,action?.energyDelta,animate));
  if (review) {
    const move = action && ACTIONS[action.kind];
    const turnAction = move ? [move.icon+' '+move.name,action.target].filter(Boolean).join(' ') : '';
    const result = move ? [
      job ? [...new Set(action.effects.map(jobEffect))].join(' · ') : effectText(action.effects),
      action.hpDelta ? 'HP '+signed(action.hpDelta) : '',
      action.energyDelta ? '⚡'+signed(action.energyDelta) : '',
      action.eliminated ? '脱落' : '',
    ].filter(Boolean).join(' · ') : '';
    if (turnAction) {
      card.append(el('span','battle-turn-action',turnAction),el('span','battle-turn-result',result));
      card.title = [player.id,turnAction,result,...action.effects.map(effect=>effect.target+' '+(job ? jobEffect(effect) : battleEffect(effect)))].filter(Boolean).join(' ／ ');
    }
  } else card.title = [player.id,flag].filter(Boolean).join(' ／ ');
  if (job) {
    card.title = [job.name,card.title,jobDescription].filter(Boolean).join(' ／ ');
    if (!onTarget) card.append(el('span','battle-job-name',job.name));
  }
  return card;
}

function battleCards(root,s,round,review,animate,onTarget) {
  const board = el('section','battle-cards');
  board.setAttribute('aria-label','対戦プレイヤー');
  const groups = round.settings.mode === 'royale' ? [round.players] :
    (round.settings.mode === 'teams' ? ['pink','blue'] : ['boss','party']).map(team=>round.players.filter(p=>p.team === team));
  const cards = new Map();
  for (const group of groups) {
    const rowSizes = round.settings.mode === 'royale'
      ? Array.from({length:Math.ceil(group.length/2)},(_,i)=>Math.min(2,group.length-i*2))
      : group.length < 4 ? [group.length] : [group.length-2,2];
    let index = 0;
    for (const size of rowSizes) {
      const row = el('div','battle-card-row');
      row.style.setProperty('--battle-columns',size);
      for (const player of group.slice(index,index+size)) {
        const card = playerCard(player,s,round,review,animate,onTarget);
        cards.set(player.id,card);
        row.append(card);
      }
      index += size;
      board.append(row);
    }
  }
  root.append(board);
  return cards;
}

export function battleHistory(root,record) {
  root.classList.add('battle-history');
  root.append(el('h3','circle-heading',battleOutcome(record.outcome)),
    el('p','circle-info',BATTLE_MODES[record.mode]+' ／ '+record.turn+'ターン'+(record.boss ? ' ／ ボス '+record.boss : '')));
  battleCards(root,{me:null},record,true,false);
  const settings = el('dl','circle-settings');
  for (const [key,title] of Object.entries({...basicFields,...detailFields})) {
    if (record.gameId === JOB_BATTLE && Object.hasOwn(JOB_BATTLE_FIXED,key)) continue;
    settings.append(el('dt','',title),el('dd','',formatSetting(key,record.settings[key])));
  }
  root.append(settings);
}

export function battleUI() {
  let turnKey, targetKind, sequence, inFlight, reviewed, refreshControls;
  let draftMatch, draftChoice, sendingJob;
  return function render(root,s,send,serverNow,openPanel) {
    const r = s.round;
    if (r.phase === 'jobs') {
      if (draftMatch !== r.id) {
        draftMatch = r.id;
        draftChoice = null;
        sendingJob = false;
      }
      renderJobDraft(root,r,send);
      return;
    }
    const me = r.players.find(p=>p.id === s.me);
    const key = r.id+'/'+r.turn;
    if (key !== turnKey) {
      turnKey = key;
      targetKind = null;
      sequence = 0;
      inFlight = new Set();
    }
    sequence = Math.max(sequence,r.ownMove?.sequence ?? 0);
    const review = r.phase === 'review' || r.phase === 'result';
    const animate = review && reviewed !== key;
    if (review) reviewed = key;
    const turn = el('div','battle-turn');
    const clock = el('span','battle-clock');
    const heading = el('div','battle-turn-heading');
    heading.append(el('strong','',r.phase === 'result' ? battleOutcome(r.outcome) : 'ターン '+r.turn),clock);
    turn.append(heading);
    const track = el('div','progress-track battle-clock-track');
    const bar = el('div','battle-clock-bar');
    track.append(bar);
    if (r.endsAt !== null && !review) turn.append(track);
    root.append(turn);

    const open = () => turnIsOpen(r,serverNow());
    async function submit(kind,target) {
      targetKind = null;
      const sent = ++sequence;
      inFlight.add(sent);
      paint();
      await send('battleMove',{kind,target,turn:r.turn,sequence:sent},r);
      if (key === turnKey) {
        inFlight.delete(sent);
        refreshControls();
      }
    }
    const canAct = me?.hp > 0 && !review;
    const cards = battleCards(root,s,r,review,animate,canAct || r.withJobs ? target=>{
      if (open() && targetKind && actionTargets(r,me,targetKind).includes(target)) {
        submit(targetKind,target);
      } else if (r.withJobs) {
        const action = review && Object.hasOwn(r.previous.actions,target) ? r.previous.actions[target] : null;
        openPanel('battleJobDetail',{player:r.players.find(player=>player.id === target),action});
      }
    } : null);

    const actions = new Map();
    const status = el('p','battle-input-status');
    if (me) {
      const keys = availableActions(r,me);
      const controls = el('section','battle-controls');
      controls.setAttribute('aria-label','行動選択');
      const choices = el('div','battle-actions battle-actions-'+keys.length);
      for (const kind of keys) {
        const action = ACTIONS[kind];
        const label = action.icon+' '+action.name;
        const control = button(label,()=>{
          if (!open() || !canUseAction(r,me,kind)) return;
          if (!action.target) submit(kind);
          else {
            targetKind = targetKind === kind ? null : kind;
            paint();
          }
        },'control battle-action battle-action-'+kind);
        const cost = actionCost(me,kind);
        if (cost) control.append(el('small','','⚡'+cost));
        if (action.defense && r.settings.defenseLimit !== null) {
          control.append(el('small','',me.defense+'/'+r.settings.defenseLimit));
        }
        actions.set(kind,control);
        choices.append(control);
      }
      controls.append(status,choices);
      root.append(controls);
    }

    let wasOpen;
    function paint() {
      const enabled = open();
      wasOpen = enabled;
      const selected = enabled && targetKind && canAct && canUseAction(r,me,targetKind) ? targetKind : null;
      const validTargets = selected ? new Set(actionTargets(r,me,selected)) : new Set();
      for (const [id,card] of cards) {
        if (canAct) {
          card.disabled = (!r.withJobs || Boolean(selected)) && !validTargets.has(id);
          card.classList.toggle('battle-target',validTargets.has(id));
        }
      }
      for (const [kind,control] of actions) {
        control.disabled = !canAct || !enabled || !canUseAction(r,me,kind);
        control.setAttribute('aria-pressed',String(selected === kind || (!selected && r.ownMove?.kind === kind)));
      }
      if (canAct) {
        const pending = [...inFlight].some(sent=>sent > (r.ownMove?.sequence ?? 0));
        const accepted = r.ownMove ? '受付済み '+ACTIONS[r.ownMove.kind].name+(r.ownMove.target ? ' · '+r.ownMove.target : '') : '';
        status.textContent = selected ? ACTIONS[selected].name+'の対象を選択' :
          pending ? '送信中…' : accepted || (enabled ? '行動を選択' : '対戦状況を同期中');
        if (r.withJobs && me.cursed && !selected) status.textContent += ' ／ 呪い：ガード不可';
        status.title = status.textContent;
      }
      if (me && !canAct) status.textContent = me.hp === 0 ? '脱落 · 観戦中' : 'このターンの行動を確定しました';
    }
    function paintClock() {
      const now = serverNow();
      const enabled = open();
      if (wasOpen !== enabled) paint();
      if (review) clock.textContent = r.phase === 'review' ? 'ターン結果' : BATTLE_MODES[r.settings.mode];
      else {
        const label = turnTimeLabel(r,now);
        if (label !== clock.textContent) clock.textContent = label;
      }
      if (r.endsAt !== null && !review) bar.style.transform = 'scaleX('+turnTimeFraction(r,now)+')';
    }
    refreshControls = paint;
    paint();
    paintClock();
    if (!review) {
      const update = () => {
        if (!turn.isConnected) return;
        paintClock();
        requestAnimationFrame(update);
      };
      requestAnimationFrame(update);
    }
  };

  function renderJobDraft(root,round,send) {
    root.append(el('h2','party-title','職業を選ぶ'),
      el('p','battle-draft-progress',`確定済み ${round.jobsReady}/${round.players.length}人`));
    const draft = round.jobDraft;
    if (!draft || draft.chosen) {
      root.append(el('p','deck-message',draft ? JOBS[draft.chosen].name+'で確定しました。全員の選択を待っています。' :
        'プレイヤーの職業選択を待っています。'));
      return;
    }
    const section = el('section','battle-draft');
    const cards = new Map();
    const confirm = button('職業を確定',async ()=>{
      const match = round.id;
      sendingJob = true;
      paint();
      if (!(await send('battleJob',{job:draftChoice},round)) && draftMatch === match) {
        sendingJob = false;
        paint();
      }
    },'primary');
    function paint() {
      confirm.disabled = !draftChoice || sendingJob;
      for (const [id,card] of cards) {
        card.setAttribute('aria-pressed',String(draftChoice === id));
        card.disabled = sendingJob;
      }
    }
    for (const id of draft.candidates) {
      const job = JOBS[id];
      const card = button('',()=>{draftChoice = id; paint();},'battle-draft-card');
      const bonus = job.hpBonus ?? 0;
      card.append(el('strong','',job.icon+' '+job.name),
        el('span','',`初期HP ${round.settings.hp+bonus} ／ 最大HP ${round.settings.maxHp+bonus}`),
        el('span','',job.description),
        ...(job.action ? [el('span','','消費 ⚡'+ACTIONS[job.action].cost)] : []));
      cards.set(id,card);
      section.append(card);
    }
    root.append(section,confirm);
    paint();
  }
}
