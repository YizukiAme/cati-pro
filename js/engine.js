/* CATI · PRO：算分和分享链接
 * 页面和模拟脚本共用这一份逻辑。
 */
(function (root) {
  var DK = ['A', 'B', 'C', 'D'];

  function create(D) {
    var ALL = D.CATS.concat(D.HIDDEN);
    var byId = {};
    ALL.forEach(function (c) { byId[c.id] = c; });

    // 每个维度能拿到的最大分：每道计分题里，这个维度绝对值最大的那个选项
    var maxAbs = { A: 0, B: 0, C: 0, D: 0 };
    D.QUESTIONS.forEach(function (q) {
      if (q.type === 'egg') return;
      DK.forEach(function (k) {
        var m = 0;
        q.options.forEach(function (o) { m = Math.max(m, Math.abs(o.e[k] || 0)); });
        maxAbs[k] += m;
      });
    });

    // 一道题的作答换成每个选项的权重：选两个各一半，小鱼干按颗数分
    function weights(q, a) {
      if (!a) return null;
      if (q.type === 'fish') {
        var f = a.fish || [0, 0, 0, 0];
        var tot = f.reduce(function (x, y) { return x + y; }, 0);
        if (!tot) return null;
        return f.map(function (n) { return n / tot; });
      }
      var sel = a.sel || [];
      if (!sel.length) return null;
      return q.options.map(function (_, i) { return sel.indexOf(i) >= 0 ? 1 / sel.length : 0; });
    }

    function answered(q, a) { return !!weights(q, a); }

    function scores(answers) {
      var raw = { A: 0, B: 0, C: 0, D: 0 };
      var last = { A: 0, B: 0, C: 0, D: 0 };
      D.QUESTIONS.forEach(function (q) {
        if (q.type === 'egg') return;
        var w = weights(q, answers[q.id]);
        if (!w) return;
        DK.forEach(function (k) {
          var v = 0;
          q.options.forEach(function (o, i) { v += w[i] * (o.e[k] || 0); });
          raw[k] += v;
          if (v) last[k] = v;
        });
      });
      return DK.map(function (k) {
        var s = maxAbs[k] ? raw[k] / maxAbs[k] : 0;
        // 正好打平时，看这个维度最后一次被推向哪边
        if (Math.abs(s) < 1e-9) s = last[k] >= 0 ? 0.001 : -0.001;
        return Math.max(-1, Math.min(1, s));
      });
    }

    function catForSigns(v) {
      for (var i = 0; i < D.CATS.length; i++) {
        var c = D.CATS[i];
        if (c.v[0] === v[0] && c.v[1] === v[1] && c.v[2] === v[2] && c.v[3] === v[3]) return c;
      }
      return null;
    }
    function signs(s) { return s.map(function (x) { return x >= 0 ? 1 : -1; }); }
    function catForScores(s) { return catForSigns(signs(s)); }

    // 成分表：离每只猫越近，占比越高
    function mix(s) {
      var k = D.META.mixSharpness;
      var list = D.CATS.map(function (c) {
        var dist = 0;
        for (var i = 0; i < 4; i++) dist += Math.abs(s[i] - c.v[i]);
        return { id: c.id, w: Math.exp(-k * dist / 8) };
      });
      var tot = list.reduce(function (x, y) { return x + y.w; }, 0);
      list.forEach(function (x) { x.p = x.w / tot; });
      list.sort(function (a, b) { return b.p - a.p; });
      return list;
    }

    function eggOf(answers) {
      var hit = null;
      D.QUESTIONS.forEach(function (q) {
        if (q.type !== 'egg') return;
        var a = answers[q.id];
        if (!a || !a.sel) return;
        a.sel.forEach(function (i) { if (q.options[i] && q.options[i].egg) hit = q.options[i].egg; });
      });
      return hit;
    }

    function hiddenFor(s, answers) {
      var egg = answers ? eggOf(answers) : null;
      if (egg) return egg;
      var m = Math.max.apply(null, s.map(Math.abs));
      if (m < D.META.schrodingerMax) return 'schrodinger';
      return null;
    }

    // 「我们注意到」：先放成对题的组合句，再放和你的偏向一致的小动作
    function says(answers, s) {
      var out = [];
      D.COMBOS.forEach(function (c) {
        var ok = Object.keys(c.when).every(function (qid) {
          var a = answers[qid];
          if (!a || !a.sel) return false;
          return a.sel.some(function (i) { return c.when[qid].indexOf(i) >= 0; });
        });
        if (ok && out.indexOf(c.say) < 0) out.push(c.say);
      });
      var pool = [];
      D.QUESTIONS.forEach(function (q, qi) {
        var w = weights(q, answers[q.id]);
        if (!w) return;
        q.options.forEach(function (o, i) {
          if (!o.say || w[i] < 0.5) return;
          var align = 0;
          DK.forEach(function (k, j) { align += (o.e[k] || 0) * s[j]; });
          if (align < 0) return;
          pool.push({ say: o.say, align: align, order: qi });
        });
      });
      pool.sort(function (a, b) { return b.align - a.align || a.order - b.order; });
      pool.forEach(function (p) { if (out.indexOf(p.say) < 0) out.push(p.say); });
      return out.slice(0, 3);
    }

    function result(answers) {
      var s = scores(answers);
      var cat = catForScores(s);
      return {
        s: s,
        catId: cat.id,
        hiddenId: hiddenFor(s, answers),
        mix: mix(s),
        says: says(answers, s)
      };
    }

    // 偏向的说法
    function lean(s, i) {
      var dim = D.DIMS[i];
      var pole = s >= 0 ? dim.pos : dim.neg;
      var a = Math.abs(s);
      if (a < 0.15) return { pole: pole, text: '两边都有一点' };
      if (a < 0.35) return { pole: pole, text: '有一点' + pole.adj };
      if (a < 0.6) return { pole: pole, text: '挺' + pole.adj };
      return { pole: pole, text: '非常' + pole.adj };
    }

    function code(v) {
      return v.map(function (x, i) { return x > 0 ? D.DIMS[i].pos.ch : D.DIMS[i].neg.ch; }).join('');
    }

    function flip(v, idx) {
      return v.map(function (x, i) { return idx.indexOf(i) >= 0 ? -x : x; });
    }
    // 天生一对：生活方式一样（贴贴、爱野），脾气互补（细腻、直球）
    function soulmate(c) { return catForSigns(flip(c.v, [1, 2])); }
    // 相爱相杀：生活方式全反着来
    function rival(c) { return catForSigns(flip(c.v, [0, 3])); }
    // 最佳友伴：脾气和节奏都一样，只是一个黏人一个独立
    function buddy(c) { return catForSigns(flip(c.v, [0])); }

    function pair(vA, vB) {
      var same = 0;
      var lines = DK.map(function (k, i) {
        if (vA[i] === vB[i]) { same++; return D.PAIR.lines[k][vA[i] > 0 ? 'pos' : 'neg']; }
        return D.PAIR.lines[k].diff;
      });
      return { same: same, title: D.PAIR.titles[same], lines: lines };
    }

    // 猜错的地方：在你眼里 ta 更 X，其实 ta 更 Y
    function guessDiff(guessV, realV) {
      var diff = [];
      for (var i = 0; i < 4; i++) {
        if (guessV[i] !== realV[i]) {
          var dim = D.DIMS[i];
          diff.push({
            guess: guessV[i] > 0 ? dim.pos : dim.neg,
            real: realV[i] > 0 ? dim.pos : dim.neg
          });
        }
      }
      return diff;
    }

    // 分享链接：#g-猫-四个维度
    // 维度量化到 -9…9，写成 a…s，只用字母和连字符
    function encode(r) {
      var id = r.hiddenId || r.catId;
      var dims = r.s.map(function (x) {
        var q = Math.max(-9, Math.min(9, Math.round(x * 9)));
        if (q === 0) q = x >= 0 ? 1 : -1;
        return String.fromCharCode(97 + q + 9);
      }).join('');
      return 'g-' + id + '-' + dims;
    }

    function decode(hash) {
      var m = /^#?g-([a-z]+)-([a-s]{4})$/.exec(hash || '');
      if (!m || !byId[m[1]]) return null;
      var s = m[2].split('').map(function (ch) { return (ch.charCodeAt(0) - 97 - 9) / 9; });
      var cat = catForScores(s);
      var id = m[1];
      var hidden = byId[id].hidden ? id : null;
      // 普通猫的 id 必须和维度对得上，对不上就以维度为准
      return { s: s, catId: cat.id, hiddenId: hidden, mix: mix(s) };
    }

    return {
      ALL: ALL, byId: byId, maxAbs: maxAbs,
      weights: weights, answered: answered, scores: scores, signs: signs,
      catForSigns: catForSigns, catForScores: catForScores, mix: mix, result: result,
      lean: lean, code: code, soulmate: soulmate, rival: rival, buddy: buddy, pair: pair, guessDiff: guessDiff,
      encode: encode, decode: decode
    };
  }

  var API = { create: create };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.MaogeEngine = API;
})(this);
