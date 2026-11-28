import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceFour,resolveFour,startFour,submitFour,winningCells} from '../server/four.js';
import {FOUR_DEFAULTS} from '../web/four-rules.js';

const empty = size => Array.from({length:size},()=>Array(size).fill(null));

test('four: every board size and roster size uses the nominated order and fixed colors',()=>{
  for (let size=6;size<=9;size++) {
    for (let count=2;count<=4;count++) {
      const ids = ['A','B','C','D'].slice(0,count);
      const round = startFour(ids,{...FOUR_DEFAULTS,size,starter:'B'},100);
      const expected = [...ids.slice(1),ids[0]];
      const colors = ['blue','red','green','yellow'].slice(0,count);
      assert.deepEqual(round.board,empty(size));
      assert.deepEqual(round.order,expected);
      assert.deepEqual(expected.map(id=>round.pieces[id]),colors);
      advanceFour(round,1100,new Set());
      for (const id of ids) submitFour(round,id,{turn:1,column:2,sequence:1});
      advanceFour(round,1100,new Set());
      assert.deepEqual(round.board.map(row=>row[2]).slice(-count),colors.toReversed());
      assert.equal(round.animation.until,1100+500*count);
      advanceFour(round,round.animation.until-1,new Set());
      assert.equal(round.phase,'drop');
      advanceFour(round,round.animation.until,new Set());
      assert.equal(round.phase,'select');
      assert.deepEqual(round.order,[...expected.slice(1),expected[0]]);
      assert.deepEqual(expected.map(id=>round.pieces[id]),colors);
      assert.deepEqual(round.moves,{});
    }
  }
});

test('four: server auto-picks only open columns, with independent choices before any drop',()=>{
  const round = startFour(['A','B','C','D'],{...FOUR_DEFAULTS,size:6,seconds:1},0);
  for (let row=0;row<6;row++) {
    round.board[row] = ['red','blue','green',null,'red',null];
  }
  // The yellow piece cannot form a line, so all four attempts are included.
  round.order = ['D','C','B','A'];
  round.board[0][3] = null;
  for (let r=1;r<6;r++) round.board[r][3] = r % 2 ? 'red' : 'blue';
  for (let r=0;r<6;r++) round.board[r][5] = 'yellow';
  round.board[0][5] = null;
  round.board[1][5] = null;
  advanceFour(round,1000,new Set());
  assert.throws(()=>submitFour(round,'A',{turn:1,column:0,sequence:1}),{code:'fourInvalid'});
  const spread = [.499,.2,.9,.1];
  let calls = 0;
  advanceFour(round,2000,new Set(),()=>spread[calls++]);
  assert.deepEqual(round.animation.drops.map(({column,row,discarded})=>[column,row,discarded]),
    [[3,0,false],[3,null,true],[5,1,false],[3,null,true]]);
  advanceFour(round,2001,new Set(),()=>{throw Error('resolved twice');});
  assert.equal(calls,4);
});

test('four: vertical, horizontal, both diagonals and overlines are detected',()=>{
  for (const [dr,dc] of [[1,0],[0,1],[1,1],[1,-1]]) {
    const board = empty(7);
    const points = Array.from({length:5},(_,i)=>[2+(i-2)*dr,3+(i-2)*dc]);
    for (const [r,c] of points) board[r][c] = 'red';
    assert.deepEqual(new Set(winningCells(board,2,3).map(String)),new Set(points.map(String)));
    board[points[0][0]][points[0][1]] = 'blue';
    assert.equal(winningCells(board,2,3).length,4);
    board[points[4][0]][points[4][1]] = 'blue';
    assert.equal(winningCells(board,2,3).length,0);
  }
});

test('four: the first winning drop stops every later drop',()=>{
  for (const order of [['A','B'],['B','A']]) {
    const board = empty(6);
    for (let r=3;r<6;r++) {
      board[r][0] = 'blue';
      board[r][5] = 'red';
    }
    const result = resolveFour(board,order,{A:0,B:5},{A:'blue',B:'red'});
    assert.equal(result.outcome.winner,order[0]);
    assert.equal(result.outcome.line.length,4);
    assert.equal(result.drops.length,1);
    assert.equal(result.drops[0].winning,true);
    assert.equal(board[2][order[0]==='A' ? 5 : 0],null);
  }
});

test('four: a full board draws, with a win taking precedence on its last square',()=>{
  const colors = ['blue','red'];
  const board = empty(6).map((row,r)=>row.map((_,c)=>colors[(r+Math.floor(c/2))%2]));
  const filled = board.map(row=>row.slice());
  board[0][0] = null;
  const draw = resolveFour(board,['A','B'],{A:0,B:0},{A:'blue',B:'red'});
  assert.deepEqual(draw.outcome,{winner:null,line:[]});
  assert.equal(draw.drops.length,1);
  assert.deepEqual(board,filled);

  board[0][0] = null;
  for (let r=1;r<4;r++) board[r][0] = 'blue';
  const win = resolveFour(board,['A','B'],{A:0,B:0},{A:'blue',B:'red'});
  assert.equal(win.outcome.winner,'A');
  assert.deepEqual(new Set(win.outcome.line.map(String)),new Set(['0,0','1,0','2,0','3,0','4,0']));
});
