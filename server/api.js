import {action,checkScope} from './game.js';
import {readHistory} from './history.js';
import {GameError, HEARTBEAT_MS, connected, isExpired, join, members, playing, reconcile, requireGame} from './room.js';
import {update} from './store.js';
import {BATTLE,JOB_BATTLE,GAME_IDS,NUMBER_CLASH,TIER,isBattle} from '../web/games.js';
import {VERSION,newerVersion} from '../web/version.js';
import {visible} from './visibility.js';
import {advanceBattle} from './battle.js';
import {advanceNumberClash} from './number-clash.js';

function progressTurn(s,now) {
  if (!s.round || !(isBattle(s.game) || s.game === NUMBER_CLASH)) return;
  const present = new Set(members(s).map(p => p.id));
  const departed = new Set(s.round.ids.filter(id => !present.has(id)));
  if (s.game === NUMBER_CLASH) advanceNumberClash(s.round,now,departed);
  else advanceBattle(s.round,now,departed);
}

const json = (value,status = 200) => Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function api(request, db, now = Date.now()) {
  const {pathname:path,searchParams} = new URL(request.url);
  const clientVersion = request.headers.get('X-App-Version');
  const unsupported = game => (game === JOB_BATTLE && (!clientVersion || newerVersion('5.0.0',clientVersion))) ||
    (game === BATTLE && clientVersion && newerVersion('3.0.0',clientVersion)) ||
    (game === NUMBER_CLASH && (!clientVersion || newerVersion('5.0.0',clientVersion)));
  try {
    if (path === '/api/version' && request.method === 'GET') return json({version:VERSION});
    if (path === '/api/join' && request.method === 'POST') {
      const {name,avatarId} = await body(request);
      const token = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9-]{36})$/i)?.[1];
      const updated = await update(db,s => {
        reconcile(s,now);
        const p = join(s,name,now,token,avatarId);
        progressTurn(s,now);
        return {id:p.id,token:p.token,pruneHistory:true};
      },now);
      return reply(updated,updated.result.id,now,unsupported,{token:updated.result.token});
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
    let id;
    const updated = await update(db,s => {
      const p = s.players.find(person => person.token === token && !person.left && !isExpired(person,now));
      if (p && (isAction || p.seen + HEARTBEAT_MS <= now)) p.seen = Math.max(p.seen,now);
      reconcile(s,now);
      if (!p) return {disconnected:true};
      id = p.id;
      progressTurn(s,now);
      if (isAction) {
        requireGame(typeof a.id === 'string' && /^[a-f0-9-]{36}$/i.test(a.id),'操作IDが無効です。',400);
        if (!p.last.includes(a.id)) {
          if (unsupported(s.game)) {
            return {error:new GameError('アプリを更新してください。',409,'updateRequired')};
          }
          const resetHistory = a.type === 'resetHistory';
          if (resetHistory) {
            checkScope(s,a);
            requireGame(playing(s) || (clientVersion ? !newerVersion(VERSION,clientVersion) : a.scope !== undefined),
              'アプリを更新してください。',409,'updateRequired');
            requireGame(s.host === p.id,'履歴をリセットできるのはホストです。',403,'forbidden');
            s.historyVersion = a.id;
          } else {
            try {
              action(s,p,a,now,clientVersion);
            } catch (error) {
              if (!['battleMove','numberCard'].includes(a.type) || !(error instanceof GameError)) throw error;
              // A late or invalid action can still move a deadline forward for everyone.
              return {error};
            }
            progressTurn(s,now);
          }
          p.last = [...p.last.slice(-31),a.id];
          return {resetHistory,retentionChanged:a.type === 'commonSettings'};
        }
      }
    },now);
    requireGame(!updated.result?.disconnected,'同名での再接続、または退出により接続が終了しました。',401,'disconnected');
    if (updated.result?.error) throw updated.result.error;
    if (isHistory) {
      const {state,revision} = updated;
      const game = searchParams.get('game');
      requireGame(game === null || game === 'all' || GAME_IDS.includes(game),'履歴の対象が無効です。',400);
      const record = await readHistory(db,now,history[1] ?? null,state.common.historyMinutes,
        game === 'all' ? null : game ?? state.game,revision);
      if (!record) return json({error:'この履歴は削除されたか、表示期限が過ぎました。',code:'historyExpired'},404);
      if (!history[1]) return json({at:now,record:record.filter(item=>!unsupported(item.gameId))});
      if (unsupported(record.gameId)) return json({error:'アプリを更新してください。',code:'updateRequired'},409);
      return json({at:now,record});
    }
    if (a?.type === 'leave') return json({ok:true});
    const online = onlineMask(updated.state,now);
    if (!isAction && request.headers.get('X-Room-Revision') === String(updated.revision) &&
        request.headers.get('X-Room-Online') === online) {
      return json({revision:updated.revision,at:now,version:VERSION,unchanged:true});
    }
    return reply(updated,id,now,unsupported);
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
function reply({state,revision},id,now,unsupported,extra={}) {
  const view = visible(state,id,now);
  if (unsupported(view.game)) {
    Object.assign(view,{game:null,round:null,playing:false});
    delete view.battle;
    if (view.numberSettings) {
      delete view.numberSettings;
      delete view.roundPlayers;
    }
  }
  if (unsupported(view.selectedGame)) view.selectedGame = TIER;
  return json({revision,at:now,version:VERSION,online:onlineMask(state,now),state:view,...extra});
}
