const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../js/data.js');
const E = require('../js/engine.js').create(D);

const snapshot = {
  s: [0.19230769230769232, 0.10444444444444444, 0.03333333333333333, -0.14545454545454545],
  catId: 'ragdoll', hiddenId: null,
  says: ['深夜聊天的是那个人，好消息第一个告诉的也是那个人', '醋不当场吃，攒着撒娇的时候一起翻旧账', '下雨天，最好有个人一起窝着'],
  mixSharpness: 22
};

function percentages(r) {
  const top = E.mix(r.s, r.mixSharpness).slice(0, 3);
  const sum = top.reduce((n, x) => n + x.p, 0);
  return top.map(x => [x.id, Math.round(x.p / sum * 100)]);
}

test('sharing preserves exact scores, the three observations and displayed composition', () => {
  const decoded = E.decode('#' + E.encode(snapshot));
  assert.deepEqual(decoded.s, snapshot.s);
  assert.deepEqual(decoded.says, snapshot.says);
  assert.equal(decoded.catId, 'ragdoll');
  assert.equal(decoded.hiddenId, null);
  assert.deepEqual(percentages(decoded), [['ragdoll', 42], ['black', 35], ['orange', 24]]);
});

test('new share URLs do not reveal any cat name or ID in plain text', () => {
  const link = E.encode(snapshot);
  for (const cat of E.ALL) {
    assert.ok(!link.includes(cat.id));
    assert.ok(!link.includes(cat.name));
  }
  assert.match(link, /^r2-[A-Za-z0-9_-]+$/);
});

test('all cat types and lean boundaries survive sharing without rounding', () => {
  for (const cat of D.CATS) {
    for (const magnitude of [0.001, 0.149999, 0.150001, 0.349999, 0.350001, 0.599999, 0.600001, 1]) {
      const r = { ...snapshot, s: cat.v.map(v => v * magnitude), catId: cat.id };
      const opened = E.decode(E.encode(r));
      assert.deepEqual(opened.s, r.s);
      assert.equal(opened.catId, cat.id);
    }
  }
});

test('both hidden results and Unicode observations survive sharing', () => {
  for (const hiddenId of ['dog', 'schrodinger']) {
    const r = { ...snapshot, hiddenId, says: ['想贴贴 🐈', '「我在」', 'café / 雨声'] };
    const opened = E.decode(E.encode(r));
    assert.equal(opened.hiddenId, hiddenId);
    assert.deepEqual(opened.says, r.says);
  }
});

test('a saved link keeps its mix settings when the site settings change', () => {
  const future = require('../js/engine.js').create({ ...D, META: { ...D.META, mixSharpness: 5 } });
  const opened = future.decode(E.encode(snapshot));
  assert.equal(opened.mixSharpness, 22);
  assert.deepEqual(opened.mix, E.mix(snapshot.s, 22));
});

test('existing browser results without mix settings can still be shared', () => {
  const { mixSharpness, ...stored } = snapshot;
  assert.deepEqual(percentages(E.decode(E.encode(stored))), [['ragdoll', 42], ['black', 35], ['orange', 24]]);
});

test('old links still open and identify their lost precision', () => {
  const opened = E.decode('#g-ragdoll-lkki');
  assert.equal(opened.catId, 'ragdoll');
  assert.equal(opened.legacy, true);
  assert.deepEqual(opened.s, [2 / 9, 1 / 9, 1 / 9, -1 / 9]);
});

test('broken or invalid share data does not crash or produce a result', () => {
  const encoded = data => 'r2-' + Buffer.from(JSON.stringify(data)).toString('base64url');
  for (const link of ['r2-!', 'r2-e30', 'g-unknown-aaaa', encoded([[1, 2, 3, 4], 'ragdoll', null, [], 22]), encoded([snapshot.s, 'unknown', null, [], 22]), encoded([snapshot.s, 'ragdoll', null, [42], 22])]) {
    assert.equal(E.decode(link), null);
  }
});
