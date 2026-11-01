// Run with: node test.js   (no dependencies)
const assert = require('node:assert/strict');
const L = require('./logic.js');

function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stateWith(cells, extra) {
  const board = Array(25).fill(null);
  let id = 1;
  for (const [i, lvl, cd] of cells) board[i] = { id: id++, lvl, cd: cd || 0 };
  return Object.assign(
    { board, score: 0, combo: 0, turn: 0, nextId: id, won: false, lastWasMerge: false, lastMergeId: null, over: false },
    extra || {}
  );
}
const count = (s) => s.board.filter(Boolean).length;

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('ok  ' + name);
}

test('new game has 6 Pups and at least one ready pair', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = L.newGame(seeded(seed));
    assert.equal(count(s), 6);
    assert.ok(s.board.filter(Boolean).every((c) => c.lvl === 1 && c.cd === 0));
    assert.ok(L.hasAnyPair(s.board, false));
    assert.equal(s.over, false);
  }
});

test('adjacency does not wrap across rows', () => {
  assert.ok(L.areAdjacent(0, 1));
  assert.ok(L.areAdjacent(0, 5));
  assert.ok(!L.areAdjacent(4, 5));
  assert.ok(!L.areAdjacent(0, 6));
  assert.ok(!L.areAdjacent(3, 3));
});

test('canMerge reports the right reason', () => {
  const s = stateWith([[0, 1], [1, 1], [2, 2], [4, 1], [10, 1, 1], [11, 1]]);
  assert.deepEqual(L.canMerge(s, 0, 1), { ok: true, reason: null });
  assert.equal(L.canMerge(s, 0, 3).reason, 'empty');
  assert.equal(L.canMerge(s, 0, 0).reason, 'same');
  assert.equal(L.canMerge(s, 1, 2).reason, 'level');
  assert.equal(L.canMerge(s, 0, 4).reason, 'far');
  assert.equal(L.canMerge(s, 10, 11).reason, 'rest');
  assert.equal(L.canMerge(Object.assign({}, s, { over: true }), 0, 1).reason, 'over');
});

test('merge burns one Squeek, levels up the survivor, rests it and spawns 1 Pup', () => {
  const s = stateWith([[0, 1], [1, 1]]);
  const r = L.applyMerge(s, 0, 1, { rng: seeded(3) });
  assert.ok(r.ok);
  assert.ok(!r.state.board.some((c) => c && c.id === 1), 'the burned Squeek is gone');
  assert.ok(r.state.board[0] === null || r.state.board[0].lvl === 1, 'its cell is empty or holds a new Pup');
  assert.equal(r.state.board[1].lvl, 2);
  assert.equal(r.state.board[1].cd, L.COOLDOWN);
  assert.equal(r.spawned, 1);
  assert.equal(count(r.state), 2, 'two Squeeks became one, plus one new Pup');
  assert.equal(r.points, 20);
  assert.equal(r.state.score, 20);
  assert.equal(r.state.turn, 1);
  assert.equal(s.board[0].lvl, 1, 'original state is untouched');
});

test('a merged Squeek cannot merge for 2 turns, then can', () => {
  let s = stateWith([[0, 1], [1, 1], [2, 2]]);
  s = L.applyMerge(s, 0, 1, { rng: seeded(5) }).state;
  assert.equal(L.canMerge(s, 1, 2).reason, 'rest');
  s = L.applyNap(s, seeded(6)).state;
  assert.equal(L.canMerge(s, 1, 2).reason, 'rest');
  s = L.applyNap(s, seeded(7)).state;
  assert.ok(L.canMerge(s, 1, 2).ok);
});

test('combo grows on consecutive merges and resets after a Nap', () => {
  let s = stateWith([[0, 1], [1, 1], [10, 1], [11, 1], [20, 1], [21, 1]]);
  let r = L.applyMerge(s, 0, 1, { rng: seeded(1) });
  assert.equal(r.combo, 0);
  r = L.applyMerge(r.state, 10, 11, { rng: seeded(2) });
  assert.equal(r.combo, 1);
  assert.equal(r.points, L.mergePoints(2, 1));
  r = L.applyMerge(r.state, 20, 21, { rng: seeded(3) });
  assert.equal(r.combo, 2);
  const napped = L.applyNap(r.state, seeded(4)).state;
  assert.equal(napped.combo, 0);
  assert.equal(napped.lastWasMerge, false);
});

test('Power Surge doubles points', () => {
  const s = stateWith([[0, 3], [1, 3]]);
  const plain = L.applyMerge(s, 0, 1, { rng: seeded(1), mult: 1 });
  const surge = L.applyMerge(s, 0, 1, { rng: seeded(1), mult: 2 });
  assert.equal(plain.points, 80);
  assert.equal(surge.points, 160);
});

test('reaching level 8 wins once; Genesis Squeeks are the top level and do not merge', () => {
  let s = stateWith([[0, 7], [1, 7], [10, 8], [11, 8]]);
  assert.equal(L.canMerge(s, 10, 11).reason, 'max');
  assert.deepEqual(L.readyPartners(s.board, 10), []);
  let r = L.applyMerge(s, 0, 1, { rng: seeded(1) });
  assert.equal(r.newLvl, 8);
  assert.ok(r.winNow);
  assert.ok(r.state.won);
  assert.equal(L.canMerge(r.state, 10, 11).reason, 'max');
});

test('a board full of Genesis Squeeks is over', () => {
  const board = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, lvl: 8, cd: 0 }));
  assert.ok(L.isGameOver(board));
});

test('game over: full and no neighbours match', () => {
  const board = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) board.push({ id: r * 5 + c + 1, lvl: ((r + c) % 2) + 1, cd: 0 });
  assert.ok(L.isGameOver(board));
  const withPair = board.map((c) => ({ ...c }));
  withPair[1].lvl = 1;
  assert.ok(!L.isGameOver(withPair), 'a ready pair keeps the game alive');
  const resting = withPair.map((c) => ({ ...c }));
  resting[0].cd = 2;
  assert.ok(!L.isGameOver(resting), 'a resting pair keeps the game alive (Nap wakes it)');
  const notFull = board.map((c) => ({ ...c }));
  notFull[7] = null;
  assert.ok(!L.isGameOver(notFull));
});

test('Nap on a full board spawns nothing and still ticks rest timers', () => {
  const board = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) board.push({ id: r * 5 + c + 1, lvl: ((r + c) % 2) + 1, cd: 0 });
  board[1].lvl = 1;
  board[0].cd = 2;
  const s = { board, score: 0, combo: 0, turn: 0, nextId: 99, won: false, lastWasMerge: false, lastMergeId: null, over: false };
  const r = L.applyNap(s, seeded(1));
  assert.equal(r.spawned, 0);
  assert.equal(r.state.board[0].cd, 1);
  assert.equal(r.state.over, false);
});

test('Block Bonus removes up to 2 Level 1 Squeeks and nothing else', () => {
  const s = stateWith([[0, 1], [1, 1], [2, 1], [3, 2], [4, 3]]);
  const r = L.applyBlockBonus(s, seeded(9));
  assert.equal(r.removed, 2);
  assert.equal(count(r.state), 3);
  assert.equal(r.state.board[3].lvl, 2);
  assert.equal(r.state.board[4].lvl, 3);
  const one = L.applyBlockBonus(stateWith([[0, 1], [1, 2]]), seeded(1));
  assert.equal(one.removed, 1);
  const none = L.applyBlockBonus(stateWith([[0, 2], [1, 2]]), seeded(1));
  assert.equal(none.removed, 0);
});

test('readyPartners lists only matching, awake neighbours', () => {
  const s = stateWith([[6, 2], [1, 2], [5, 2], [7, 3], [11, 2, 1]]);
  assert.deepEqual(L.readyPartners(s.board, 6).sort((a, b) => a - b), [1, 5]);
  assert.deepEqual(L.readyPartners(s.board, 11), []);
});

test('mergePoints', () => {
  assert.equal(L.mergePoints(2, 0), 20);
  assert.equal(L.mergePoints(8, 0), 1280);
  assert.equal(L.mergePoints(3, 2), 40 + 30);
});

test('parseStatus: running, resting, stale, fault, unavailable, junk', () => {
  const base = (m, a) => ({ measurement: m, builder: { anchor: a } });
  const running = L.parseStatus(
    base({ freshness: 'online', coreStatus: 'ACTIVE', rpmMilli: 12400, distanceMm: 1820000 }, { blockHeight: '4135', blockProgress: '500000000' })
  );
  assert.equal(running.state, 'surge');
  assert.equal(running.rpm, 12.4);
  assert.equal(running.kmToday, 1.82);
  assert.equal(running.blockHeight, 4135);
  assert.equal(running.blockProgress, 0.5);

  const resting = L.parseStatus(base({ freshness: 'online', coreStatus: 'IDLE', rpmMilli: 0, distanceMm: 0 }, { blockHeight: '1', blockProgress: '35822082' }));
  assert.equal(resting.state, 'nap');
  assert.equal(resting.rpm, 0);

  assert.equal(L.parseStatus(base({ freshness: 'stale', coreStatus: 'ACTIVE' }, {})).state, 'stale');
  assert.equal(L.parseStatus(base({ freshness: 'online', coreStatus: 'COUNTER_FAULT' }, {})).state, 'fault');
  assert.equal(L.parseStatus({ status: 'unavailable' }).state, 'unavailable');
  assert.equal(L.parseStatus(null).state, 'unavailable');
  assert.equal(L.parseStatus('nope').state, 'unavailable');
  assert.equal(L.parseStatus({}).state, 'unavailable');

  const unknownNums = L.parseStatus(base({ freshness: 'online', coreStatus: 'IDLE' }, { blockHeight: 'abc', blockProgress: 5e12 }));
  assert.equal(unknownNums.rpm, null, 'missing values stay null, never zero');
  assert.equal(unknownNums.blockHeight, null);
  assert.equal(unknownNums.blockProgress, 1, 'progress is clamped to 0..1');
});

test('detectBlockBonus needs a known earlier height and a higher new one', () => {
  assert.ok(L.detectBlockBonus(10, 11));
  assert.ok(!L.detectBlockBonus(10, 10));
  assert.ok(!L.detectBlockBonus(null, 11));
  assert.ok(!L.detectBlockBonus(10, null));
  assert.ok(!L.detectBlockBonus(11, 10));
});

test('parseRetryAfter stays between 5 s and 5 min', () => {
  assert.equal(L.parseRetryAfter('10'), 10000);
  assert.equal(L.parseRetryAfter(null), 30000);
  assert.equal(L.parseRetryAfter('soon'), 30000);
  assert.equal(L.parseRetryAfter('0'), 5000);
  assert.equal(L.parseRetryAfter('99999'), 300000);
});

test('a long random playthrough never breaks the rules', () => {
  const rng = seeded(42);
  let s = L.newGame(rng);
  for (let step = 0; step < 400 && !s.over; step++) {
    let moved = false;
    for (let i = 0; i < 25 && !moved; i++) {
      const p = L.readyPartners(s.board, i);
      if (p.length) {
        const r = L.applyMerge(s, i, p[0], { rng });
        assert.ok(r.ok);
        s = r.state;
        moved = true;
      }
    }
    if (!moved) s = L.applyNap(s, rng).state;
    assert.ok(count(s) <= 25);
    assert.ok(s.board.filter(Boolean).every((c) => c.lvl >= 1 && c.lvl <= 8 && c.cd >= 0 && c.cd <= 2));
  }
  assert.ok(s.score > 0);
});

console.log('\n' + passed + ' tests passed');
