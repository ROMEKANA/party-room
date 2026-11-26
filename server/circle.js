import {GameError, requireGame} from './room.js';

// Round rules ported from the hosted Circle & Cross project.
const need = requireGame;
function player(id,name) { return {id,name,cards:['○','○','○','×'],stack:[],revealed:[],wins:0}; }
const active = g => g.players.filter(p=>p.cards.length);
const total = g => g.players.reduce((n,p)=>n+p.stack.length,0);
function next(g,id,filter = ()=>true) {
	const i=g.players.findIndex(p=>p.id===id);
	for(let d=1;d<=g.players.length;d++) { const p=g.players[(i+d)%g.players.length];if(p.cards.length&&filter(p))return p.id; }
	return id;
}
function log(g,s) {g.log=[...g.log,s].slice(-35);}
function round(g) {
	g.round++;g.phase='first';g.turn=g.parent;g.bid=0;g.bidder=null;g.passed=[];g.flipped=0;g.outcome=null;
	g.players.forEach(p=>{p.stack=[];p.revealed=[];});log(g,`ラウンド ${g.round} 開始`);
}
function result(g,success) {
	const p=g.players.find(p=>p.id===g.bidder);
	if(success)p.wins++;
	g.outcome=success?'success':'failure';g.phase=success?'result':'loss';
	log(g,`${p.name} が${success?'挑戦成功！ 1勝獲得':'×をめくり、挑戦失敗'}`);
	if(p.wins>=2){g.phase='finished';g.winner=p.id;}
}
export function startCircle(ids, host) {
	const g = {id:crypto.randomUUID(), ids, host, players:ids.map(id=>player(id,id)),
		round:0, version:0, log:[], winner:null};
	g.parent = ids[Math.floor(Math.random()*ids.length)];
	round(g);
	return g;
}
export function act(g,id,a) {
	const p=g.players.find(p=>p.id===id);
	need(p || (a.type==='next' && g.host===id),'参加情報がありません');
	if(a.type==='next') {
		need(g.phase==='result','結果を確認してください');need(id===g.bidder||id===g.host,'挑戦者かホストが進めます');
		g.parent=g.players.find(x=>x.id===g.bidder).cards.length?g.bidder:next(g,g.bidder);round(g);return g;
	}
	if(a.type==='lose') {
		need(g.phase==='loss'&&g.bidder===id,'失敗したプレイヤーが札を選びます');
		need(Number.isInteger(a.card)&&a.card>=0&&a.card<p.cards.length,'札を選んでください');
		p.cards.splice(a.card,1);g.phase='result';log(g,`${p.name} は札を1枚失いました${p.cards.length?'':'（脱落）'}`);
		if(active(g).length===1){g.phase='finished';g.winner=active(g)[0].id;}return g;
	}
	need(g.turn===id,'あなたの手番ではありません');
	if(a.type==='place') {
		need(['first','stack'].includes(g.phase),'今は札を置けません');
		need(Number.isInteger(a.card)&&a.card>=0&&a.card<p.cards.length&&!p.stack.includes(a.card),'その札は置けません');
		p.stack.push(a.card);log(g,`${p.name} が札を伏せました`);
		if(g.phase==='first') {
			if(active(g).every(x=>x.stack.length)){g.phase='stack';g.turn=g.parent;}
			else g.turn=next(g,id,x=>!x.stack.length);
		}else g.turn=next(g,id);
	}else if(a.type==='bid') {
		need(['stack','bidding'].includes(g.phase),'今は宣言できません');
		need(Number.isInteger(a.value)&&a.value>g.bid&&a.value<=total(g),'場の枚数以下で、現在より大きい数を宣言してください');
		g.bid=a.value;g.bidder=id;g.phase='bidding';log(g,`${p.name} が ${a.value} 枚を宣言`);
		g.turn=next(g,id,x=>!g.passed.includes(x.id));
	}else if(a.type==='pass') {
		need(g.phase==='bidding'&&g.bidder!==id,'今はパスできません');
		g.passed.push(id);log(g,`${p.name} がパス`);
		g.turn=next(g,id,x=>!g.passed.includes(x.id));
	}else if(a.type==='reveal') {
		need(g.phase==='reveal'&&g.bidder===id,'挑戦者だけがめくれます');
		const target=g.players.find(x=>x.id===a.target);need(target&&target.revealed.length<target.stack.length,'めくる札がありません');
		need(p.revealed.length===p.stack.length||target.id===id,'先に自分の札をすべてめくってください');
		const index=target.stack[target.stack.length-1-target.revealed.length],symbol=target.cards[index];
		target.revealed.push(symbol);log(g,`${p.name} が ${target.name} の ${symbol} を公開`);
		if(symbol==='×')result(g,false);else{g.flipped++;if(g.flipped>=g.bid)result(g,true);}
	}else throw new GameError('不明な操作です');
	if(g.phase==='bidding'&&active(g).every(x=>x.id===g.bidder||g.passed.includes(x.id))){g.phase='reveal';g.turn=g.bidder;log(g,'宣言が確定。挑戦者は自分の札からめくります');}
	return g;
}
export function view(g,id) {
	const {id:matchId, phase, version, round, bid, flipped, outcome} = g;
	return {id:matchId, phase, version, round, bid, flipped, outcome, ownPlaced:g.players.find(p=>p.id===id)?.stack||[],host:g.host===id,turn:g.players.findIndex(p=>p.id===g.turn),parent:g.players.findIndex(p=>p.id===g.parent),bidder:g.players.findIndex(p=>p.id===g.bidder),winner:g.players.findIndex(p=>p.id===g.winner),passed:(g.passed||[]).map(x=>g.players.findIndex(p=>p.id===x)),players:g.players.map(p=>({name:p.name,me:p.id===id,cards:p.id===id?p.cards:null,count:p.cards.length,stack:p.stack.length,revealed:p.revealed,wins:p.wins})),
		log:g.log};
}
