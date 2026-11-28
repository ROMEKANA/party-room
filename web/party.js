import {GAMES,GAME_IDS,JOB_BATTLE,isBattle,CIRCLE,FOUR,NUMBER_CLASH} from './games.js';
import {button,el} from './board.js';

export function gameCard(id) {
  const game = GAMES[id];
  const artwork = el('span','game-art '+(isBattle(id)?'battle-art'+(id===JOB_BATTLE?' job-battle-art':''):id===CIRCLE?'circle-art':id===NUMBER_CLASH?'number-art':id===FOUR?'four-art':'tier-art'));
  artwork.setAttribute('aria-hidden','true');
  if (id===CIRCLE) artwork.append(el('b','circle','○'),el('b','cross','×'));
  else if (id===NUMBER_CLASH) artwork.append(el('b','number-negative','−3'),el('b','number-choice','9'),el('b','number-positive','+6'));
  else if (id===FOUR) {
    const grid = el('span','four-art-grid');
    for (const piece of ['', '', 'red','', '', 'blue','red','', 'blue','red','blue','yellow',
      'red','blue','green','green']) {
      const dot = el('b','four-piece');
      dot.dataset.piece = piece;
      grid.append(dot);
    }
    artwork.append(grid);
  }
  else if (isBattle(id)) artwork.append(el('b','', '⚡'),el('b','', '🛡'),el('b','', '💥'));
  else for (const rank of ['S','A','B','C','D']) artwork.append(el('b','',rank));
  return [artwork,el('strong','',game.title)];
}
export function lobby(root,s,send,open) {
  const host = s.host===s.me;
  const active = GAME_IDS.indexOf(s.selectedGame);
  const cover = el('div','game-cover');
  cover.append(...gameCard(s.selectedGame));
  const shift = offset=>send('browse',{choice:GAME_IDS[(active+offset+GAME_IDS.length)%GAME_IDS.length]});
  const controls = el('div','game-switch');
  const prev = button('‹',()=>shift(-1)), next = button('›',()=>shift(1));
  prev.setAttribute('aria-label','前のゲーム');
  next.setAttribute('aria-label','次のゲーム');
  prev.disabled = next.disabled = !host;
  controls.append(prev,button('ゲーム一覧',()=>open('gameList')),next);
  const choose = button('このゲームを選択する',()=>send('choose',{choice:s.selectedGame}),'primary');
  choose.disabled = !host;
  root.append(cover,controls,choose);
  if (!host) root.append(el('p','deck-message','ホストがゲームを選択します。'));
}
