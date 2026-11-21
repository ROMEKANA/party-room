import {connected, leave, requireGame, settingsFor} from './room.js';
import {start, topicAction} from './round.js';
import {mode1} from './mode1.js';
import {consensus} from './consensus.js';
import {mode23} from './mode23.js';

export function action(s, p, a, now) {
  const r = s.round;
  const host = s.host === p.id;
  if (a.type === 'leave') return leave(s,p,now);
  if (a.type === 'transfer' || a.type === 'kick') {
    const target = connected(s,now).find(person => person.id === a.player && person !== p);
    requireGame(host && target && (a.type === 'transfer' || !r), 'この参加者に対する操作はできません。');
    if (a.type === 'transfer') s.host = target.id;
    else leave(s,target,now);
    return;
  }
  requireGame((r?.id ?? null) === a.round && (r?.version ?? 0) === a.version,
    'ゲームが進みました。最新の画面で操作してください。', 409, 'stale');
  if (a.type === 'settings') {
    requireGame(host && !r, '設定変更は待機中のホストのみです。');
    s.settings = settingsFor(s,a.settings,now);
  } else if (a.type === 'start') {
    requireGame(host && (!r || r.phase === 'result'), '開始できるのは待機中か結果画面のホストです。');
    start(s,now);
  } else if (a.type === 'end' || a.type === 'lobby') {
    requireGame(host && r && (a.type === 'end' || r.phase === 'result'), '待機に戻せるのはホストです。');
    s.round = null;
    s.players = s.players.filter(person => !person.left);
  } else {
    requireGame(r && (r.ids.includes(p.id) || (host && a.type === 'next')), '次のラウンドをお待ちください。');
    if (a.type === 'reroll' || a.type === 'topic') topicAction(r,p.id,a);
    else if (r.mode === 1) mode1(r,p.id,a,host);
    else if (r.mode === 4) consensus(r,p.id,a);
    else mode23(s,r,p.id,a,host,now);
  }
}
