import {button,el} from './board.js';

export const CIRCLE_RULES = [
  ['手札', '○3枚と×1枚で開始します。親はランダムに決まり、全員が順番に1枚ずつ伏せます。'],
  ['札を重ねる・宣言する', '親から順に札を1枚重ねるか、場から○を何枚めくれるか宣言します。'],
  ['競り', '手番の人は、それまでより大きい枚数を宣言するかパスします。宣言者以外が全員パスしたら挑戦です。'],
  ['公開', '挑戦者はまず自分の山から、次に他の人の山からめくります。各山の一番上から順に公開します。'],
  ['勝敗', '必要な枚数の○をめくれば1勝。×をめくった人は手札を1枚失い、0枚で脱落します。2勝するか、最後の1人になれば勝利です。'],
  ['次のラウンド', '直前の挑戦者が次の親です。脱落した場合は、順番で次に残っている人が親です。'],
];

export function circleSettings(root,s) {
  const settings = el('dl','circle-settings');
  for (const [label,value] of [
    ['対応人数','2〜6人'],['初期手札','○3枚・×1枚'],['勝利条件','2勝するか、最後の1人になる'],
  ]) settings.append(el('dt','',label),el('dd','',value));
  root.append(settings);
  if (s.startProblem) root.append(el('p','deck-message',s.startProblem));
}

export function circleTable(root,g,send) {
  const grid = el('div','circle-grid');
  const me = g.players.find(player=>player.me);
  const mine = Boolean(me && g.players[g.turn]?.me);
  for (const [index,player] of g.players.entries()) {
    const tile = el('section','circle-player');
    tile.classList.toggle('active',g.turn===index && g.phase!=='finished');
    tile.classList.toggle('eliminated',!player.count);
    const status = [player.count ? player.count+'枚' : '脱落',player.wins+'勝'];
    if (g.parent===index) status.push('親');
    if (g.passed.includes(index)) status.push('パス');
    tile.append(el('strong','',player.name),el('span','circle-status',status.join(' · ')));
    const pile = el('div','circle-pile');
    for (let j=0;j<player.stack;j++) {
      const value = player.revealed[j];
      pile.append(el('span',value==='×'?'cross':value==='○'?'circle':'face-down',value ?? '◆'));
    }
    tile.append(pile);
    if (send && mine && g.phase==='reveal' && player.stack>player.revealed.length) {
      const flip = button('めくる',()=>send('reveal',{target:index}));
      flip.disabled = !player.me && me.revealed.length<me.stack;
      tile.append(flip);
    }
    grid.append(tile);
  }
  root.append(grid);
}

export function circlePlay(root,g,send,host) {
  const captions = {first:'最初の1枚を伏せる',stack:'札を重ねる / 勝負に出る',
    bidding:'宣言を競り上げる',reveal:'宣言した枚数をめくる',loss:'失う札を1枚選ぶ',
    result:'ラウンド終了',finished:'ゲーム終了'};
  const total = g.players.reduce((sum,p)=>sum+p.stack,0);
  const me = g.players.find(p=>p.me);
  const mine = Boolean(me && g.players[g.turn]?.me);
  root.append(el('h2','circle-heading',captions[g.phase]));
  const info = [`ラウンド ${g.round}`,`場の札 ${total}枚`];
  if (g.bid) info.push(`宣言 ${g.bid}枚`);
  if (g.phase==='reveal') info.push(`成功 ${g.flipped} / ${g.bid}`);
  root.append(el('p','circle-info',info.join(' · ')));
  circleTable(root,g,send);
  const actions = el('div','circle-actions');
  if (g.phase==='finished') {
    actions.append(el('p','',g.players[g.winner].name+'の勝利！'));
  } else if (g.phase==='result') {
    actions.append(el('p','',g.outcome==='success'?'○ 挑戦成功':'× 挑戦失敗'));
    if (host || g.players[g.bidder]?.me) actions.append(button('次のラウンドへ',()=>send('next'),'primary'));
  } else {
    const turn = el('p','',me ? (mine?'あなたの番':g.players[g.turn]?.name+'さんの番') : '観戦中');
    actions.append(turn);
    if (me?.cards?.length) {
      const hand = el('div','circle-hand');
      const losing = g.phase==='loss' && g.players[g.bidder]?.me;
      me.cards.forEach((value,index)=>{
        const card = button(value,()=>send(losing?'lose':'place',{card:index}),value==='×'?'cross':'circle');
        card.disabled = !losing && (!mine || !['first','stack'].includes(g.phase) || g.ownPlaced.includes(index));
        card.setAttribute('aria-label',(losing?'失う札':'手札')+' '+(index+1)+' '+value);
        hand.append(card);
      });
      actions.append(hand);
    }
    if (mine && ['stack','bidding'].includes(g.phase)) {
      const bid = el('input','circle-bid-value');
      bid.type = 'number';
      bid.inputMode = 'numeric';
      bid.min = g.bid+1;
      bid.max = total;
      bid.value = g.bid+1;
      bid.setAttribute('aria-label','宣言する枚数');
      const bidButton = button(g.phase==='stack'?'勝負に出る':'宣言を上げる',()=>send('bid',{value:bid.valueAsNumber}),'primary');
      bidButton.disabled = g.bid>=total;
      bid.oninput = ()=>{bidButton.disabled = !bid.reportValidity() || bid.value === '';};
      actions.append(bid,bidButton);
      if (g.phase==='bidding') actions.append(button('パスする',()=>send('pass')));
    }
  }
  root.append(actions);
}
