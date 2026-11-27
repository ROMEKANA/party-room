import {button,el} from './board.js';
import {PLAYER_AVATARS,resolveAvatarId} from './player-profile.js';

const MARKS = {
  good:['👍','Good'], bad:['👎','Bad'], done:['✓','行動済み'],
  pending:['…','未選択'], turn:['▶','手番'],
};
let textContext;
const graphemes = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ja',{granularity:'grapheme'}) : null;

export function playerAvatar(player,{self = false,mark} = {}) {
  const id = resolveAvatarId(player.avatarId,player.color);
  const icon = el('span','avatar'+(self ? ' self' : ''));
  const image = el('img');
  image.src = './player-'+id+'.png';
  image.alt = '';
  image.draggable = false;
  icon.append(image);
  if (mark != null) {
    const [symbol,label] = Object.hasOwn(MARKS,mark) ? MARKS[mark] : [mark,'進捗 '+mark];
    const badge = el('span','mark',symbol);
    badge.dataset.status = mark;
    badge.title = label;
    badge.setAttribute('aria-label',label);
    icon.append(badge);
  }
  return icon;
}

function label(cls,value,weight,wrap = false) {
  const node = el('span',cls,value);
  // Measure only the text's width in ems. The cell size remains independent of the contents.
  textContext ??= document.createElement('canvas').getContext('2d');
  const font = getComputedStyle(document.documentElement).fontFamily;
  textContext.font = weight+' 100px '+font;
  const width = textContext.measureText(String(value)).width / 100;
  node.style.setProperty('--label-width',Math.max(1,width));
  if (wrap && width > 6) {
    const chars = graphemes ? [...graphemes.segment(value)].map(({segment})=>segment) : [...value];
    const midpoint = Math.ceil(chars.length / 2);
    const halves = [chars.slice(0,midpoint).join(''),chars.slice(midpoint).join('')];
    const splitWidth = Math.max(...halves.map(text=>textContext.measureText(text).width)) / 100;
    node.classList.add('balanced-name');
    node.style.setProperty('--split-width',Math.max(1,splitWidth));
    node.replaceChildren(...halves.map(text=>el('span','',text)));
  }
  return node;
}

export function playerDisplay(player,options = {}) {
  const {id,roles = [],score,mark,online} = player;
  const selected = options.selected === id;
  const person = options.select ? button('',()=>options.select(id),'person player-tab') : el('div','person');
  person.classList.toggle('offline',online === false);
  if (options.select) {
    person.setAttribute('aria-pressed',String(selected));
    person.setAttribute('aria-label',options.selectionLabel?.(id) ?? id);
  }

  const content = el('span','player-content');
  // Room for an icon, the line heights at their font ratios, and the gaps.
  content.style.setProperty('--player-units',1.56+(roles.length ? .53 : 0)+(score != null ? .50 : 0));
  content.append(playerAvatar(player,{self:id === options.me,mark}),label('player-name',id,700,true));
  if (roles.length) content.append(label('roles',roles.join('・'),700));
  if (score != null) {
    const points = label('player-score',score,750);
    points.setAttribute('aria-label',score+'点');
    content.append(points);
  }
  person.title = [id,...roles,...(online === false ? ['切断中'] : [])].join('・');
  person.append(content);
  return person;
}

export function renderPlayers(root,players,options = {}) {
  root.style.setProperty('--people',Math.min(5,Math.max(1,players.length)));
  root.replaceChildren(...players.map(player => playerDisplay(player,options)));
}

export function avatarPicker(root,initial) {
  let selected = resolveAvatarId(initial);
  const choices = new Map();
  function select(id) {
    selected = id;
    for (const [value,choice] of choices) choice.setAttribute('aria-pressed',String(value === selected));
  }
  for (const [avatarId,name] of Object.entries(PLAYER_AVATARS)) {
    const choice = button('',()=>select(avatarId),'avatar-choice');
    choice.title = name;
    choice.setAttribute('aria-label',name);
    choice.append(playerAvatar({avatarId}));
    choices.set(avatarId,choice);
    root.append(choice);
  }
  select(selected);
  return {value:()=>selected,select};
}
