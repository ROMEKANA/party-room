const TOKEN = 'tier-studio-session';
const NAME = 'tier-studio-name';
export const storedName = () => localStorage.getItem(NAME) ?? '';
const makeId = () => globalThis.crypto.randomUUID?.() ??
  '10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c =>
    (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c)/4)))).toString(16));

export function connect(onState,onError,onClose) {
  let token = sessionStorage.getItem(TOKEN), generation = 0, timer, state, revision = -1, at = -1;
  let pending = false;
  function stop(message) {
    generation++;
    token = null;
    state = null;
    revision = at = -1;
    pending = false;
    sessionStorage.removeItem(TOKEN);
    clearTimeout(timer);
    onClose(message);
  }
  async function request(path, payload, auth = token) {
    const headers = auth ? {Authorization:'Bearer '+auth} : {};
    if (payload) headers['Content-Type'] = 'application/json';
    const response = await fetch('/api/'+path,{method:payload?'POST':'GET',headers,
      body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(6000)});
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error),{code:data.code});
    return data;
  }
  function accept(data) {
    if (data.revision < revision || (data.revision === revision && data.at < at)) return;
    revision = data.revision;
    at = data.at;
    const old = state;
    state = data.state;
    onState(state,old);
  }
  async function poll(g = generation) {
    if (!token || g !== generation) return;
    try {
      const data = await request('state');
      if (g === generation) accept(data);
    } catch (error) {
      if (g !== generation) return;
      if (error.code === 'disconnected') return stop(error.message);
      onError('接続を確認中です。復帰するとゲームを再開します。',true);
    }
    if (g === generation) timer = setTimeout(()=>poll(g),document.hidden?1400:450);
  }
  if (token) queueMicrotask(()=>poll());
  return {
    async join(name) {
      const data = await request('join',{name},null);
      clearTimeout(timer);
      generation++;
      revision = at = -1;
      token = data.token;
      sessionStorage.setItem(TOKEN,token);
      localStorage.setItem(NAME,data.state.me);
      accept(data);
      timer = setTimeout(()=>poll(),450);
    },
    async send(type,fields = {},base = state?.round) {
      if (!token || pending) return false;
      const g = generation;
      pending = true;
      const payload = {id:makeId(),type,round:base?.id??null,version:base?.version??0,...fields};
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
        else onError(error.code ? error.message : '通信できませんでした。接続を確認してください。',false);
        return false;
      } finally {
        if (g === generation) pending = false;
      }
    },
  };
}
