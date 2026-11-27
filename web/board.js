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
  drawRows(root,state.tiers,cards,onCard,newPositions);
  fit(root);
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
export function drawRows(root,tiers,cards,onCard,positions) {
  root.replaceChildren(...tiers.map(tier => {
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
      const cls = 'tile'+(card.provisional?' provisional':'')+(answer || card.correct===false?' wrong':'')+(card.mismatch?' mismatch':'');
      const tile = button('',()=>onCard(card),cls);
      tile.title = card.word;
      tile.setAttribute('aria-label',card.word+'・'+tier+(answer?'・正解 '+answer:'')+(card.correct===false?'・不正解':'')+(card.mismatch?'・不一致':''));
      tile.append(el('span','name',card.word));
      if (answer) tile.append(el('span','answer-chip',answer));
      area.append(tile);
      positions?.set(card.id,{tier,tile});
    }
    row.append(label,area);
    return row;
  }));
}
export function fit(root = $('board')) {
  for (const area of root.querySelectorAll('.tier-content')) {
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

export function progress(r) {
  return r.mode === 1 ? r.fixed : r.mode === 2 && ['placement','attemptResult','result'].includes(r.phase)
    ? r.cards.filter(c => c.placed).length : r.submitted;
}
export function showProgress(count,total,label,bar) {
  label.textContent = `${count} / ${total} 枚`;
  bar.style.width = (total ? count / total * 100 : 0)+'%';
}
export function showLife(r,label) {
  label.hidden = r?.lives == null;
  label.textContent = label.hidden ? '' : `🤍${r.lives}/${r.initialLives}`;
  if (!label.hidden) label.setAttribute('aria-label',`残りライフ ${r.lives} / ${r.initialLives}`);
}
export function resultSummary(r) {
  if (r.mode === 1) return `確定 ${r.fixed} / ${r.total} 枚 · ミス ${r.misses} 回`;
  if (r.mode === 2) return `正解 ${r.correctCount} / ${r.total} 枚 · `+
    (r.target == null ? `提出 ${r.attempts} 回` : `${(r.correctCount/r.total*100).toFixed(1)}%（目標 ${r.target}%） · 提出 ${r.attempts} 回`);
  return 'お題は「'+r.topic+'」';
}
export function cardDescription(c) {
  return [c.owner,c.placed?'配置 '+c.placed:'',c.answer?'正解 '+c.answer:''].filter(Boolean).join(' ／ ');
}
