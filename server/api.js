import {action} from './game.js';
import {GameError, HEARTBEAT_MS, join, reconcile, requireGame} from './room.js';
import {update} from './store.js';
import {visible} from './visibility.js';

const json = (value,status = 200) => Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function api(request, db, now = Date.now()) {
  const path = new URL(request.url).pathname;
  try {
    if (path === '/api/join' && request.method === 'POST') {
      const {name} = await body(request);
      const updated = await update(db,s => {
        reconcile(s,now);
        const p = join(s,name,now);
        return {id:p.id,token:p.token};
      });
      return reply(updated,updated.result.id,now,{token:updated.result.token});
    }
    const isAction = path === '/api/action' && request.method === 'POST';
    if (!isAction && !(path === '/api/state' && request.method === 'GET')) return json({error:'操作が見つかりません。'},404);
    const a = isAction ? await body(request) : null;
    const token = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9-]{36})$/i)?.[1];
    requireGame(token,'名前を入力して参加してください。',401,'disconnected');
    let id;
    const updated = await update(db,s => {
      const p = s.players.find(person => person.token === token && !person.left);
      requireGame(p,'同名での再接続、または退出により接続が終了しました。',401,'disconnected');
      id = p.id;
      if (p.seen + HEARTBEAT_MS <= now || isAction) p.seen = Math.max(p.seen,now);
      reconcile(s,now);
      if (isAction) {
        requireGame(typeof a.id === 'string' && /^[a-f0-9-]{36}$/i.test(a.id),'操作IDが無効です。',400);
        if (!p.last.includes(a.id)) {
          action(s,p,a,now);
          p.last = [...p.last.slice(-31),a.id];
        }
      }
    });
    if (a?.type === 'leave') return json({ok:true});
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
function reply({state,revision},id,now,extra={}) {
  return json({revision,at:now,state:visible(state,id,now),...extra});
}
