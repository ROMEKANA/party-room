import {COLORS} from './config.js';
export const $ = id => document.getElementById(id);
export function el(tag, cls, value) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (value != null) node.textContent = value;
  return node;
}
export function button(text, callback, cls = 'control') {
  const b = el('button',cls,text);
  b.type = 'button';
  b.onclick = callback;
  return b;
}
const PALETTE = ['#edaa9e','#eac38e','#e8d68d','#b9d39c','#9dcbb8','#a1c8d6','#adbfe1','#c3b3de','#e2b4ca','#cdb5a2'];
const MARKS = {good:'👍',bad:'👎',done:'✓'};
export const short = name => [...(name??'')].slice(0,6).join('');
export function avatars(s) {
  const players = s.players.filter(p=>!p.left);
  $('players').style.setProperty('--people',Math.min(5,players.length));
  $('players').replaceChildren(...players.map(p => {
    const person = el('div','person'+(p.online?'':' offline'));
    const roles = [p.id===s.host?'ホスト':'',p.id===s.round?.parent?'親':'',
      p.id===s.round?.turn?'手番':'',p.spectator?'観戦':''].filter(Boolean);
    const circle = el('span','avatar'+(p.id===s.me?' self':''),[...p.id][0]);
    circle.style.setProperty('--avatar',PALETTE[p.color]);
    if (p.mark != null) {
      const mark = el('span','mark',MARKS[p.mark]??p.mark);
      mark.title = p.mark==='good'?'Good':p.mark==='bad'?'Bad':'進捗';
      circle.append(mark);
    }
    person.title = [p.id,...roles,...(p.online?[]:['切断中'])].join('・');
    person.append(circle,el('span','player-name',short(p.id)),el('small','roles',roles.join('・')));
    return person;
  }));
}
let lastBoard = '', positions = new Map();
export function board(state,onCard) {
  const cards = state.round?.cards.filter(c=>c.placed) ?? [];
  const key = JSON.stringify([state.round?.id,state.round?.phase,state.round?.parent,state.tiers,cards]);
  if (lastBoard === key) return;
  const oldHero = $('current').querySelector('.hero-card');
  const origin = oldHero?.getBoundingClientRect();
  const oldId = oldHero?.dataset.card;
  const root = $('board');
  const newPositions = new Map();
  lastBoard = key;
  root.replaceChildren(...state.tiers.map(tier => {
    const row = el('div','tier');
    row.style.setProperty('--tier',COLORS[tier]);
    const label = el('div','tier-label');
    label.append(el('strong','',tier));
    const area = el('div','tier-content');
    const inside = cards.filter(c=>c.placed===tier);
    row.style.flexGrow = String(1+Math.sqrt(inside.length)*.27);
    if (!inside.length) area.append(el('span','empty','＋'));
    for (const card of inside) {
      const answer = card.answer && card.answer!==tier ? card.answer : null;
      const cls = 'tile'+(card.provisional?' provisional':'')+(answer?' wrong':'');
      const tile = button('',()=>onCard(card),cls);
      tile.title = card.word;
      tile.setAttribute('aria-label',card.word+'・'+tier+(answer?'・正解 '+answer:''));
      tile.append(el('span','name',card.word));
      if (answer) tile.append(el('span','answer-chip',answer));
      area.append(tile);
      newPositions.set(card.id,{tier,tile});
    }
    row.append(label,area);
    return row;
  }));
  fit();
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (const [id,{tier,tile}] of newPositions) {
      const previous = positions.get(id);
      if (previous?.tier === tier || !tile.animate) continue;
      const from = id===oldId ? origin : previous?.rect;
      if (!from?.width) continue;
      const to = tile.getBoundingClientRect();
      const flight = el('span','card-flight',tile.querySelector('.name').textContent);
      Object.assign(flight.style,{left:from.x+'px',top:from.y+'px',width:from.width+'px',height:from.height+'px'});
      document.body.append(flight);
      const motion = flight.animate([
        {transform:'none',opacity:.86},
        {transform:`translate(${to.x-from.x}px,${to.y-from.y}px) scale(${to.width/from.width},${to.height/from.height})`,opacity:.2},
      ],{duration:220,easing:'cubic-bezier(.2,.75,.25,1)'});
      motion.finished.then(()=>flight.remove(),()=>flight.remove());
    }
  }
  positions = new Map([...newPositions].map(([id,{tier,tile}])=>[id,{tier,rect:tile.getBoundingClientRect()}]));
}
export function fit() {
  for (const area of document.querySelectorAll('.tier-content')) {
    const count = area.querySelectorAll('.tile').length;
    if (!count) continue;
    const w = area.clientWidth - 4, h = area.clientHeight - 4;
    const gap = count > 24 ? 1 : 2;
    let best = {area:0,w:1,h:1};
    for (let cols = 1; cols <= count; cols++) {
      const rows = Math.ceil(count/cols);
      const width = Math.max(0,Math.min(124,Math.floor((w-gap*(cols-1))/cols)));
      const height = Math.max(0,Math.min(46,Math.floor((h-gap*(rows-1))/rows)));
      const quality = width*height*Math.min(1,width/Math.max(1,height));
      if (quality>best.area) best = {area:quality,w:width,h:height};
    }
    area.style.setProperty('--card-w',best.w+'px');
    area.style.setProperty('--card-h',best.h+'px');
    area.style.setProperty('--name-size',Math.max(4,Math.min(13,best.h*.54,best.w*.42))+'px');
    area.style.setProperty('--answer-size',Math.max(4,Math.min(16,(best.h-2)*.55,(best.w-2)*.48))+'px');
    area.style.setProperty('--tile-gap',gap+'px');
  }
}
