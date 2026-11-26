import {VERSION,newerVersion} from './version.js';

const TOKEN = 'tier-studio-session';
const NAME = 'tier-studio-name';
const REFRESH = 'party-room-refresh';
export const storedName = () => localStorage.getItem(NAME) ?? '';
const makeId = () => globalThis.crypto.randomUUID?.() ??
  '10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c =>
    (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c)/4)))).toString(16));

export function connect(onState,onError,onClose,onUpdate) {
  let token = sessionStorage.getItem(TOKEN), generation = 0, timer, state, revision = -1, at = -1, online;
  let pending = false, polling = false, failures = 0, published = VERSION, refreshName = null;
  const refreshed = sessionStorage.getItem(REFRESH);
  if (refreshed) {
    try { refreshName = JSON.parse(refreshed).name; } catch {}
  }
  const available = () => newerVersion(published);
  function notifyUpdate() {
    onUpdate(available() && !state?.playing ? published : null,state);
  }
  function stop(message) {
    generation++;
    token = null;
    state = null;
    revision = at = -1;
    failures = 0;
    pending = false;
    sessionStorage.removeItem(TOKEN);
    clearTimeout(timer);
    onClose(message);
    notifyUpdate();
    schedule();
  }
  async function request(path, payload, auth = token, headers = {}) {
    headers['X-App-Version'] = VERSION;
    if (auth) headers.Authorization = 'Bearer '+auth;
    if (payload) headers['Content-Type'] = 'application/json';
    const response = await fetch('/api/'+path,{method:payload?'POST':'GET',headers,
      body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(6000),cache:'no-store'});
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error),{code:data.code});
    return data;
  }
  function accept(data) {
    if (newerVersion(data.version,published)) published = data.version;
    if (data.revision != null && (data.revision > revision || data.revision === revision && data.at >= at)) {
      revision = data.revision;
      at = data.at;
      if (data.state) {
        online = data.online;
        const old = state;
        state = data.state;
        onState(state,old);
      } else if (data.unchanged && failures) onState(state,state);
    }
    notifyUpdate();
  }
  function delay() {
    if (!token) return 60_000;
    const base = document.hidden ? 4800 : state?.playing ? 450 : 1400;
    return Math.min(8000,base * 2**Math.min(failures,5));
  }
  function schedule(wait = delay()) {
    clearTimeout(timer);
    timer = setTimeout(poll,wait);
  }
  async function poll() {
    if (polling) return;
    polling = true;
    const g = generation;
    try {
      const headers = token && online != null ? {'X-Room-Revision':String(revision),'X-Room-Online':online} : {};
      const data = await request(token ? 'state' : 'version',null,token,headers);
      if (g === generation) {
        accept(data);
        failures = 0;
      }
    } catch (error) {
      if (g !== generation) return;
      if (error.code === 'disconnected') return stop(error.message);
      failures++;
      if (token) onError('接続を確認中です。復帰するとゲームを再開します。',true);
    } finally {
      polling = false;
      if (g === generation) schedule();
      else if (token) schedule(0);
    }
  }
  async function join(name, automatic = false) {
    if (!automatic && available()) throw Object.assign(new Error('アプリを更新してください。'),{code:'updateRequired'});
    const data = await request('join',{name});
    generation++;
    revision = at = -1;
    token = data.token;
    sessionStorage.setItem(TOKEN,token);
    localStorage.setItem(NAME,data.state.me);
    accept(data);
    schedule();
  }
  document.addEventListener('visibilitychange',()=>{if (!document.hidden) schedule(0);});
  window.addEventListener('pageshow',()=>schedule(0));
  queueMicrotask(async()=>{
    if (refreshed) {
      const target = (()=>{try { return JSON.parse(refreshed).version; } catch { return null; }})();
      sessionStorage.removeItem(REFRESH);
      if (newerVersion(target)) {
        published = target;
        notifyUpdate();
      } else if (refreshName) {
        try { await join(refreshName,true); refreshName = null; }
        catch (error) {
          stop('更新後に再接続できませんでした。名前を確認して、もう一度参加してください。');
        }
      }
    }
    schedule(0);
  });
  return {
    join,
    refresh(version) {
      sessionStorage.setItem(REFRESH,JSON.stringify({version,name:state?.me ?? refreshName}));
      const url = new URL(location.href);
      url.searchParams.set('version',version+'-'+Date.now());
      location.replace(url);
    },
    async history(id) {
      const g = generation;
      try {
        return await request(id ? 'history/'+encodeURIComponent(id) : 'history');
      } catch (error) {
        if (error.code === 'disconnected' && g === generation) stop(error.message);
        throw error;
      }
    },
    async send(type,fields = {},base = state?.round) {
      if (!token || pending || (available() && !state?.playing && type !== 'leave')) return false;
      const g = generation;
      pending = true;
      const payload = {id:makeId(),type,game:state.game,scope:state.scope,
        round:base?.id??null,version:base?.version??0,
        ...(base?.draftRevision != null ? {draftRevision:base.draftRevision} : {}),...fields};
      try {
        let data;
        try {data = await request('action',payload);}
        catch (error) {
          if (error.code && error.code !== 'busy') throw error;
          if (g !== generation) return false;
          data = await request('action',payload);
        }
        if (g !== generation) return false;
        if (type === 'leave') stop('');
        else accept(data);
        return true;
      } catch (error) {
        if (g !== generation) return false;
        if (error.code === 'disconnected') stop(error.message);
        else if (error.code === 'updateRequired' || error.code === 'stale') {
          onError(error.message,false);
          schedule(0);
        } else onError(error.code ? error.message : '通信できませんでした。接続を確認してください。',false);
        return false;
      } finally {
        if (g === generation) pending = false;
      }
    },
  };
}
