/*
 * Squeek Merge - pure game logic (no DOM, no network).
 * Works in the browser (window.SqueekLogic) and in Node (require).
 * Every function takes plain data and returns new plain data.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SqueekLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SIZE = 5;
  var CELLS = SIZE * SIZE;
  var MAX_LEVEL = 8;
  var COOLDOWN = 2; // turns a freshly merged Squeek rests before it can merge again
  var START_COUNT = 6;
  var NAMES = ['Pup', 'Scout', 'Runner', 'Sprinter', 'Wheelsmith', 'Miner', 'Legend', 'Genesis'];

  function levelName(lvl) {
    return NAMES[lvl - 1] || NAMES[0];
  }

  function emptyBoard() {
    var b = [];
    for (var i = 0; i < CELLS; i++) b.push(null);
    return b;
  }

  function cloneBoard(board) {
    return board.map(function (c) {
      return c ? { id: c.id, lvl: c.lvl, cd: c.cd } : null;
    });
  }

  function emptyIndexes(board) {
    var out = [];
    for (var i = 0; i < board.length; i++) if (!board[i]) out.push(i);
    return out;
  }

  function pick(len, rng) {
    return Math.min(len - 1, Math.floor(rng() * len));
  }

  // Mutates the board it is given (callers pass a clone).
  function spawn(board, count, rng, nextId) {
    var empty = emptyIndexes(board);
    var spawned = 0;
    while (spawned < count && empty.length) {
      var i = empty.splice(pick(empty.length, rng), 1)[0];
      board[i] = { id: nextId++, lvl: 1, cd: 0 };
      spawned++;
    }
    return { nextId: nextId, spawned: spawned };
  }

  function tick(board) {
    for (var i = 0; i < board.length; i++) {
      if (board[i] && board[i].cd > 0) board[i].cd -= 1;
    }
    return board;
  }

  function areAdjacent(a, b) {
    var ar = Math.floor(a / SIZE), ac = a % SIZE;
    var br = Math.floor(b / SIZE), bc = b % SIZE;
    return Math.abs(ar - br) + Math.abs(ac - bc) === 1;
  }

  function forEachPair(board, fn) {
    for (var i = 0; i < board.length; i++) {
      var col = i % SIZE;
      var row = Math.floor(i / SIZE);
      if (col < SIZE - 1 && fn(i, i + 1)) return true;
      if (row < SIZE - 1 && fn(i, i + SIZE)) return true;
    }
    return false;
  }

  function hasAnyPair(board, ignoreCooldown) {
    return forEachPair(board, function (a, b) {
      var A = board[a], B = board[b];
      if (!A || !B || A.lvl !== B.lvl || A.lvl >= MAX_LEVEL) return false;
      return ignoreCooldown || (A.cd === 0 && B.cd === 0);
    });
  }

  // The board is over when it is full and no two neighbours share a level,
  // even counting resting Squeeks (a Nap can still wake those up).
  function isGameOver(board) {
    return emptyIndexes(board).length === 0 && !hasAnyPair(board, true);
  }

  function readyPartners(board, i) {
    var A = board[i];
    var out = [];
    if (!A || A.cd > 0 || A.lvl >= MAX_LEVEL) return out;
    var row = Math.floor(i / SIZE), col = i % SIZE;
    var cand = [];
    if (row > 0) cand.push(i - SIZE);
    if (row < SIZE - 1) cand.push(i + SIZE);
    if (col > 0) cand.push(i - 1);
    if (col < SIZE - 1) cand.push(i + 1);
    cand.forEach(function (j) {
      var B = board[j];
      if (B && B.lvl === A.lvl && B.cd === 0) out.push(j);
    });
    return out;
  }

  function makeState(board, nextId) {
    return {
      board: board,
      score: 0,
      combo: 0,
      turn: 0,
      nextId: nextId,
      won: false,
      lastWasMerge: false,
      lastMergeId: null,
      over: false
    };
  }

  function newGame(rng) {
    rng = rng || Math.random;
    for (var tries = 0; tries < 50; tries++) {
      var board = emptyBoard();
      var s = spawn(board, START_COUNT, rng, 1);
      if (hasAnyPair(board, false)) return makeState(board, s.nextId);
    }
    var fb = emptyBoard();
    fb[0] = { id: 1, lvl: 1, cd: 0 };
    fb[1] = { id: 2, lvl: 1, cd: 0 };
    var s2 = spawn(fb, START_COUNT - 2, rng, 3);
    return makeState(fb, s2.nextId);
  }

  function canMerge(state, a, b) {
    if (state.over) return { ok: false, reason: 'over' };
    var A = state.board[a], B = state.board[b];
    if (!A || !B) return { ok: false, reason: 'empty' };
    if (a === b) return { ok: false, reason: 'same' };
    if (A.lvl !== B.lvl) return { ok: false, reason: 'level' };
    if (!areAdjacent(a, b)) return { ok: false, reason: 'far' };
    if (A.lvl >= MAX_LEVEL) return { ok: false, reason: 'max' };
    if (A.cd > 0 || B.cd > 0) return { ok: false, reason: 'rest' };
    return { ok: true, reason: null };
  }

  function mergePoints(newLvl, combo) {
    return 10 * Math.pow(2, newLvl - 1) + combo * 5 * newLvl;
  }

  // Merge a into b. The survivor takes b's cell, one Squeek is burned,
  // the survivor rests for COOLDOWN turns, then 1 new Pup appears (one per turn).
  function applyMerge(state, a, b, opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random;
    var mult = opts.mult > 0 ? opts.mult : 1;
    var chk = canMerge(state, a, b);
    if (!chk.ok) return { ok: false, reason: chk.reason, state: state };

    var board = tick(cloneBoard(state.board));
    var newLvl = Math.min(MAX_LEVEL, state.board[b].lvl + 1);
    var id = state.nextId;
    board[a] = null;
    board[b] = { id: id, lvl: newLvl, cd: COOLDOWN };
    var sp = spawn(board, 1, rng, id + 1);

    var combo = state.lastWasMerge ? state.combo + 1 : 0;
    var points = mergePoints(newLvl, combo) * mult;
    var winNow = !state.won && newLvl === MAX_LEVEL;

    var next = {
      board: board,
      score: state.score + points,
      combo: combo,
      turn: state.turn + 1,
      nextId: sp.nextId,
      won: state.won || winNow,
      lastWasMerge: true,
      lastMergeId: id,
      over: isGameOver(board)
    };
    return { ok: true, state: next, points: points, newLvl: newLvl, spawned: sp.spawned, winNow: winNow, combo: combo };
  }

  // Nap: skip the merge, rest everyone one turn, one new Pup appears.
  function applyNap(state, rng) {
    rng = rng || Math.random;
    if (state.over) return { ok: false, reason: 'over', state: state };
    var board = tick(cloneBoard(state.board));
    var sp = spawn(board, 1, rng, state.nextId);
    var next = Object.assign({}, state, {
      board: board,
      combo: 0,
      turn: state.turn + 1,
      nextId: sp.nextId,
      lastWasMerge: false,
      lastMergeId: null,
      over: isGameOver(board)
    });
    return { ok: true, state: next, spawned: sp.spawned };
  }

  // Block Bonus: remove up to `count` Level 1 Squeeks.
  function applyBlockBonus(state, rng, count) {
    rng = rng || Math.random;
    count = count == null ? 2 : count;
    var board = cloneBoard(state.board);
    var pups = [];
    for (var i = 0; i < board.length; i++) if (board[i] && board[i].lvl === 1) pups.push(i);
    var removed = 0;
    while (removed < count && pups.length) {
      var idx = pups.splice(pick(pups.length, rng), 1)[0];
      board[idx] = null;
      removed++;
    }
    var next = Object.assign({}, state, { board: board, over: isGameOver(board) });
    return { state: next, removed: removed };
  }

  // ---- Live wheel data -------------------------------------------------

  function num(v) {
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    return null;
  }

  // Turns a /v1/status response into the small summary the game needs.
  // Anything unknown stays null; it is never turned into zero.
  function parseStatus(d) {
    var out = { state: 'unavailable', rpm: null, kmToday: null, blockHeight: null, blockProgress: null };
    if (!d || typeof d !== 'object' || d.status === 'unavailable') return out;
    var m = d.measurement;
    if (!m || typeof m !== 'object') return out;
    if (m.freshness !== 'online') {
      out.state = 'stale';
      return out;
    }
    if (m.coreStatus === 'ACTIVE') out.state = 'surge';
    else if (m.coreStatus === 'IDLE') out.state = 'nap';
    else {
      out.state = 'fault';
      return out;
    }
    var rpmMilli = num(m.rpmMilli);
    var dist = num(m.distanceMm);
    out.rpm = rpmMilli === null ? null : rpmMilli / 1000;
    out.kmToday = dist === null ? null : dist / 1e6;
    var a = d.builder && d.builder.anchor;
    if (a && typeof a === 'object') {
      out.blockHeight = num(a.blockHeight);
      var p = num(a.blockProgress);
      out.blockProgress = p === null ? null : Math.max(0, Math.min(1, p / 1e9));
    }
    return out;
  }

  function detectBlockBonus(prevHeight, nextHeight) {
    return prevHeight != null && nextHeight != null && nextHeight > prevHeight;
  }

  // Retry-After header (seconds) -> milliseconds, kept between 5 s and 5 min.
  function parseRetryAfter(header) {
    var n = header == null ? NaN : Number(header);
    if (!isFinite(n)) return 30000;
    return Math.max(5000, Math.min(300000, Math.round(n * 1000)));
  }

  return {
    SIZE: SIZE,
    CELLS: CELLS,
    MAX_LEVEL: MAX_LEVEL,
    COOLDOWN: COOLDOWN,
    NAMES: NAMES,
    levelName: levelName,
    newGame: newGame,
    areAdjacent: areAdjacent,
    canMerge: canMerge,
    applyMerge: applyMerge,
    applyNap: applyNap,
    applyBlockBonus: applyBlockBonus,
    hasAnyPair: hasAnyPair,
    isGameOver: isGameOver,
    readyPartners: readyPartners,
    mergePoints: mergePoints,
    parseStatus: parseStatus,
    detectBlockBonus: detectBlockBonus,
    parseRetryAfter: parseRetryAfter
  };
});
