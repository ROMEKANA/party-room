import {battleRoster,gameMembers, isOnline, members, playing, roundPlayers} from './room.js';
import {currentInput, lifeStatus, orderedCards} from './round.js';
import {consensusProgress,consensusView} from './consensus.js';
import {currentCardId} from './placement.js';
import {judgeId} from './mode23.js';
import {isBattle,CIRCLE,TIER} from '../web/games.js';
import {currentStartProblem} from './game.js';
import {view as circleView} from './circle.js';
import {battleView} from './battle.js';
import {DEFAULTS,TIERS} from '../web/config.js';

export function visible(s, id, now) {
  const r = s.game === TIER ? s.round : null;
  const active = playing(s);
  const gameIds = active ? s.round.ids : gameMembers(s).map(p => p.id);
  const participant = Boolean(r?.ids.includes(id));
  const showAuthors = r?.mode === 2 ? r.settings.mode2ShowAuthors : r?.settings.mode3ShowAuthors;
  const hideAuthors = r && r.mode !== 1 && active && (!participant || (id === r.parent && !showAuthors));
  const {topicSource, ...settings} = {...DEFAULTS,...s.settings};
  const state = {
    me:id, host:s.host, settings, historyVersion:s.historyVersion ?? null,
    game:s.game, selectedGame:s.selectedGame, scope:s.scope,
    common:s.common, playing:active,
    ...(r && active ? {tierRoundSettings:r.settings} : {}),
    ...(r && !active ? {roundPlayers:roundPlayers(s,now)} : {}),
    tiers:TIERS[(r?.settings ?? s.settings).difficulty],
    startProblem:currentStartProblem(s,now),
    players:members(s).map(p => {
      let mark = null;
      if (r?.mode === 4) {
        mark = consensusProgress(r,p.id);
      } else if (r?.mode === 1) {
        if (Object.hasOwn(r.votes,p.id)) mark = r.votes[p.id];
        else if (r.cards[r.turn].owner === p.id && r.cards[r.turn].word) mark = 'done';
      } else if (r?.phase === 'input' && r.ids.includes(p.id) && p.id !== r.parent &&
          !(r.mode === 3 && hideAuthors)) {
        mark = r.cards.filter(c => c.owner === p.id && !c.word).length || 'done';
      }
      if (s.game === CIRCLE && s.round?.turn === p.id) mark = 'turn';
      return {id:p.id,color:p.color,online:isOnline(p,now),left:p.left,mark,
        spectator:Boolean(s.game && !gameIds.includes(p.id))};
    }),
    round:null,
  };
  if (s.game === CIRCLE && s.round) {
    state.round = circleView({...s.round,host:s.host},id);
    return state;
  }
  if (isBattle(s.game)) {
    state.battle = battleRoster(s);
    if (s.round) {
      state.round = battleView(s.round,id,roundPlayers(s,now));
      if (!active) state.roundPlayers = roundPlayers(s,now);
    }
    return state;
  }
  if (!r) return state;
  if (r.mode === 4) {
    state.round = consensusView(r,id,currentInput(r,id));
    return state;
  }
  const result = r.phase === 'result';
  const current = r.mode === 1 ? r.cards[r.turn] : r.cards.find(c => c.id === currentCardId(r));
  const input = participant ? currentInput(r,id) : null;
  const showTopic = r.mode !== 3 || result || (participant && id !== r.parent);
  const showWords = r.mode !== 2 || !['topic','input'].includes(r.phase);
  const peekMode2 = r.mode === 2 && r.phase === 'input' && participant && id !== r.parent &&
    (r.settings.peekBoardWhileTyping ?? DEFAULTS.peekBoardWhileTyping);
  const cardView = c => ({
    id:c.id, word:c.word, placed:peekMode2 ? c.answer : c.placed, fixed:c.fixed,
    ...(!hideAuthors ? {owner:c.owner} : {}),
    ...(r.mode === 2 && r.phase === 'attemptResult' && r.settings.mode2Rule === 'accuracy'
      ? {correct:c.placed === c.answer} : {}),
    ...(result || (r.mode === 1 && c.fixed && c.placed !== c.answer) ? {answer:c.answer} : {}),
  });
  const cards = [];
  if (showWords || peekMode2) {
    cards.push(...orderedCards(r,peekMode2).map(cardView));
    if (!peekMode2) {
      const unplaced = r.cards.filter(c => c.word && !c.placed);
      // The original deal cycles through the writers. Keep that order private.
      if (hideAuthors) unplaced.sort((a,b) => a.id.localeCompare(b.id));
      cards.push(...unplaced.map(cardView));
    }
  }
  if (r.mode === 1 && r.proposal) {
    const proposed = cards.find(c => c.id === current.id);
    proposed.placed = r.proposal.tier;
    proposed.provisional = true;
  }
  state.round = {
    id:r.id, version:r.version, mode:r.mode, phase:r.phase, parent:r.parent, setter:r.setter,
    topic:showTopic ? r.topic : null,
    ...(r.phase === 'topic' && id === r.setter ? {candidate:r.candidate} : {}),
    turn:r.mode === 1 ? current.owner : null,
    total:r.cards.length, submitted:r.cards.filter(c => c.word).length,
    fixed:r.cards.filter(c => c.fixed).length,
    ...lifeStatus(r),
    misses:r.misses, attempts:r.attempts,
    ...(r.mode === 1 && input && r.settings.mode1ConfirmTurn ? {confirmTurn:true} : {}),
    ...(r.mode === 2 && r.settings.mode2Rule === 'accuracy' ? {target:r.settings.mode2Target} : {}),
    input:input ? {id:input.id,tier:input.answer} : null,
    current:showWords && current?.word ? cardView(current) : null,
    cards, excluded:r.excluded, feedback:r.feedback, result:r.result,
    ...(result && r.mode === 1 ? {history:r.history ?? [], ...(r.scores ? {scores:r.scores} : {})} : {}),
    proposal:r.proposal, vote:participant && id !== current?.owner && r.phase === 'vote' &&
      !Object.hasOwn(r.votes,id), canPlace:participant && r.phase === 'placement' &&
      (r.mode === 1 ? id !== current.owner : id === r.parent),
    canJudge:r.phase === 'oral' && id === judgeId(s,r,now),
    canSubmit:r.mode === 2 && r.phase === 'placement' && id === r.parent && !r.queue.length,
  };
  return state;
}
