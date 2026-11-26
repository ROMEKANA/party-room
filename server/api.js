import {action,checkScope,playing} from './game.js';
import {readHistory} from './history.js';
import {GameError, HEARTBEAT_MS, connected, join, reconcile, requireGame} from './room.js';
import {update} from './store.js';
import {VERSION,newerVersion} from '../web/version.js';
import {visible} from './visibility.js';

const json = (value,status = 200) => Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function api(request, db, now = Date.now()) {
  const path = new URL(request.url).pathname;
  const clientVersion = request.headers.get('X-App-Version');
  try {
    if (path === '/api/version' && request.method === 'GET') return json({version:VERSION});
    if (path === '/api/join' && request.method === 'POST') {
      const {name} = await body(request);
      const token = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9-]{36})$/i)?.[1];
      const updated = await update(db,s => {
        reconcile(s,now);
        const p = join(s,name,now,token);
        return {id:p.id,token:p.token,pruneHistory:true};
      },now);
      return reply(updated,updated.result.id,now,{token:updated.result.token});
    }
    const isAction = path === '/api/action' && request.method === 'POST';
    const history = path.match(/^\/api\/history(?:\/([a-f0-9-]{36}))?$/i);
    const isHistory = request.method === 'GET' && history;
    if (!isAction && !isHistory && !(path === '/api/state' && request.method === 'GET')) {
      return json({error:'操作が見つかりません。'},404);
    }
    const a = isAction ? await body(request) : null;
    const token = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9-]{36})$/i)?.[1];
    requireGame(token,'名前を入力して参加してください。',401,'disconnected');
    let id, heartbeat;
    const updated = await update(db,s => {
      const p = s.players.find(person => person.token === token && !person.left);
      requireGame(p,'同名での再接続、または退出により接続が終了しました。',401,'disconnected');
      id = p.id;
      heartbeat = p.seen + HEARTBEAT_MS <= now;
      if (heartbeat || isAction) p.seen = Math.max(p.seen,now);
      reconcile(s,now);
      if (isAction) {
        requireGame(typeof a.id === 'string' && /^[a-f0-9-]{36}$/i.test(a.id),'操作IDが無効です。',400);
        if (!p.last.includes(a.id)) {
          const resetHistory = a.type === 'resetHistory';
          if (resetHistory) {
            checkScope(s,a);
            requireGame(playing(s) || (clientVersion ? !newerVersion(VERSION,clientVersion) : a.scope !== undefined),
              'アプリを更新してください。',409,'updateRequired');
            requireGame(s.host === p.id,'履歴をリセットできるのはホストです。',403,'forbidden');
            s.historyVersion = a.id;
          } else {
            action(s,p,a,now,clientVersion);
          }
          p.last = [...p.last.slice(-31),a.id];
          return {resetHistory,retentionChanged:a.type === 'commonSettings'};
        }
      }
    },now);
    if (isHistory) {
      const {state,revision} = updated;
      const record = await readHistory(db,now,history[1] ?? null,state.common.historyMinutes,state.game,revision);
      if (!record) return json({error:'この履歴は削除されたか、表示期限が過ぎました。',code:'historyExpired'},404);
      return json({at:now,record});
    }
    if (a?.type === 'leave') return json({ok:true});
    const online = onlineMask(updated.state,now);
    if (!isAction && request.headers.get('X-Room-Revision') === String(updated.revision) &&
        request.headers.get('X-Room-Online') === online) {
      return json({revision:updated.revision,at:now,version:VERSION,unchanged:true});
    }
    return reply(updated,id,now);
  } catch (error) {
    if (error instanceof GameError) return json({error:error.message,code:error.code},error.status);
    console.error('Tier Studio request failed',error);
    return json({error:'サーバーとの通信に失敗しました。',code:'server'},500);
  }
}
async function body(request) {
  const text = await request.text();
  requireGame(text.length <= 4096,'送信内容が長すぎます。',413);
  try {
    const value = JSON.parse(text);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch {}
  throw new GameError('送信内容が無効です。',400);
}
function onlineMask(state,now) {
  return String(connected(state,now).reduce((mask,p)=>mask | (1 << p.color),0));
}
function reply({state,revision},id,now,extra={}) {
  return json({revision,at:now,version:VERSION,online:onlineMask(state,now),state:visible(state,id,now),...extra});
}
