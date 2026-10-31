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

    // 推力只有 1、0.5、0.4，选两个各一半，小鱼干按 1/3、2/3 分，所以每道题的得分乘以 60 一定是整数。
    // 分数按「整数 ÷ 整数」算，分享链接只要存这两个整数就能原样还原，不用存一长串小数。
    var SCALE = 60;
    var DEN = {};
    DK.forEach(function (k) { DEN[k] = Math.round(maxAbs[k] * SCALE); });

    function scores(answers) {
      var raw = { A: 0, B: 0, C: 0, D: 0 };      // 原始分 × 60（整数）
      var rawF = { A: 0, B: 0, C: 0, D: 0 };     // 以防以后改出不是整数的推力
      var exact = true;
      var last = { A: 0, B: 0, C: 0, D: 0 };
      D.QUESTIONS.forEach(function (q) {
        if (q.type === 'egg') return;
        var w = weights(q, answers[q.id]);
        if (!w) return;
        DK.forEach(function (k) {
          var v = 0;
          q.options.forEach(function (o, i) { v += w[i] * (o.e[k] || 0); });
          var n = Math.round(v * SCALE);
          if (Math.abs(v * SCALE - n) > 1e-6) exact = false;
          raw[k] += n; rawF[k] += v;
          if (v) last[k] = v;
        });
      });
      return DK.map(function (k) {
        var s = exact ? (raw[k] ? raw[k] / DEN[k] : 0) : (maxAbs[k] ? rawF[k] / maxAbs[k] : 0);
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
    function mix(s, sharpness) {
      var k = sharpness == null ? D.META.mixSharpness : sharpness;
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
        mixSharpness: D.META.mixSharpness,
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
    // 最佳配对：节奏一样（贴贴、心动），性子互补（敏感、直球）
    function soulmate(c) { return catForSigns(flip(c.v, [1, 2])); }
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

    // 猜错的地方：哪个维度，ta 真实的方向是哪边
    function guessDiff(guessV, realV) {
      var diff = [];
      for (var i = 0; i < 4; i++) {
        if (guessV[i] !== realV[i]) diff.push({ key: DK[i], real: realV[i] > 0 ? 'pos' : 'neg' });
      }
      return diff;
    }

    // ---------- 分享链接 ----------
    // r3：结果快照，不含逐题答案，分数不舍入，链接要短（二维码才扫得出来）。
    //   r3-分数A.分数B.分数C.分数D.隐藏款.成分表锐度[.句子…]
    //   分数：「分子_分母」（36 进制），还原出来和原来一模一样；凑不成的就写原始小数（x 开头，小数点写成 p）
    //   隐藏款：0 = 没有，1、2… = HIDDEN 里的第几只
    //   句子：c几 = COMBOS 里的第几句，o题号_选项 = 那个选项的 say；data.js 里找不到的原文，写成 t + Base64url
    // 所以 COMBOS 新句子请加在末尾、别调顺序；题号也别改，不然旧链接会对不上句子。
    // 链接里只有数字和编号，看不出是哪只猫；但这不是加密，拿到链接的人可以算出来。
    var REF_SAY = Object.create(null), SAY_REF = Object.create(null);
    D.COMBOS.forEach(function (c, i) {
      var ref = 'c' + i.toString(36);
      REF_SAY[ref] = c.say;
      if (!SAY_REF[c.say]) SAY_REF[c.say] = ref;
    });
    D.QUESTIONS.forEach(function (q) {
      q.options.forEach(function (o, i) {
        if (!o.say) return;
        var ref = 'o' + q.id + '_' + i;
        REF_SAY[ref] = o.say;
        if (!SAY_REF[o.say]) SAY_REF[o.say] = ref;
      });
    });

    function toB64(text) {
      var bytes = new TextEncoder().encode(text);
      return btoa(Array.from(bytes, function (b) { return String.fromCharCode(b); }).join(''))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function fromB64(t) {
      var binary = atob(t.replace(/-/g, '+').replace(/_/g, '/'));
      return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, function (ch) { return ch.charCodeAt(0); }));
    }
    function encNumber(x) { return String(x).replace('.', 'p'); }
    function decNumber(t) { return /^-?[0-9]+(?:p[0-9]+)?(?:e-?[0-9]+)?$/.test(t) ? Number(t.replace('p', '.')) : NaN; }

    function encScore(x, k) {
      var dens = [DEN[k], 1000, 9];
      for (var j = 0; j < dens.length; j++) {
        var d = dens[j];
        if (!d) continue;
        var n = Math.round(x * d);
        if (n / d === x) return (n < 0 ? '-' : '') + Math.abs(n).toString(36) + '_' + d.toString(36);
      }
      return 'x' + encNumber(x);
    }
    function decScore(t) {
      var m = /^(-?)([0-9a-z]+)_([0-9a-z]+)$/.exec(t);
      if (m) {
        var n = parseInt(m[2], 36), d = parseInt(m[3], 36);
        return d ? (m[1] ? -n : n) / d : NaN;
      }
      return t.charAt(0) === 'x' ? decNumber(t.slice(1)) : NaN;
    }

    function encode(r) {
      var parts = r.s.map(function (x, i) { return encScore(x, DK[i]); });
      var hi = r.hiddenId ? D.HIDDEN.map(function (c) { return c.id; }).indexOf(r.hiddenId) + 1 : 0;
      parts.push(hi.toString(36));
      parts.push(encNumber(r.mixSharpness == null ? D.META.mixSharpness : r.mixSharpness));
      (r.says || []).slice(0, 3).forEach(function (t) { parts.push(SAY_REF[t] || 't' + toB64(t)); });
      return 'r3-' + parts.join('.');
    }

    function decode(hash) {
      var token = (hash || '').replace(/^#/, '');
      if (/^r3-/.test(token)) {
        try {
          var p = token.slice(3).split('.');
          if (p.length < 6 || p.length > 9) return null;
          var s = p.slice(0, 4).map(decScore);
          if (!s.every(function (x) { return Number.isFinite(x) && Math.abs(x) <= 1; })) return null;
          if (!/^[0-9a-z]$/.test(p[4])) return null;
          var hi = parseInt(p[4], 36), hc = hi ? D.HIDDEN[hi - 1] : null;
          if (hi && !hc) return null;
          var sharp = decNumber(p[5]);
          if (!Number.isFinite(sharp) || sharp <= 0 || sharp > 100) return null;
          var observations = [];
          for (var i = 6; i < p.length; i++) {
            var t = p[i];
            if (t.charAt(0) === 't') observations.push(fromB64(t.slice(1)));
            else if (REF_SAY[t]) observations.push(REF_SAY[t]);
            // 编号格式对、但这句话后来从 data.js 里删掉了：跳过这一句，其他照常显示
            else if (!/^(?:c[0-9a-z]{1,2}|o[0-9a-z]+_[0-9]{1,2})$/.test(t)) return null;
          }
          return { s: s, catId: catForScores(s).id, hiddenId: hc ? hc.id : null, says: observations, mixSharpness: sharp, mix: mix(s, sharp) };
        } catch (e) { return null; }
      }

      // r2：上一版的快照（JSON + Base64url，链接很长），照样能打开
      if (/^r2-/.test(token)) {
        try {
          var binary = atob(token.slice(3).replace(/-/g, '+').replace(/_/g, '/'));
          var bytes = Uint8Array.from(binary, function (ch) { return ch.charCodeAt(0); });
          var data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
          if (!Array.isArray(data) || data.length !== 5) return null;
          var s = data[0], id = data[1], hidden = data[2], observations = data[3], sharpness = data[4];
          if (!Array.isArray(s) || s.length !== 4 || !s.every(function (x) { return Number.isFinite(x) && Math.abs(x) <= 1; })) return null;
          if (!byId[id] || byId[id].hidden || catForScores(s).id !== id) return null;
          if (hidden !== null && (!byId[hidden] || !byId[hidden].hidden)) return null;
          if (!Array.isArray(observations) || observations.length > 3 || !observations.every(function (x) { return typeof x === 'string'; })) return null;
          if (!Number.isFinite(sharpness) || sharpness <= 0 || sharpness > 100) return null;
          return { s: s, catId: id, hiddenId: hidden, says: observations, mixSharpness: sharpness, mix: mix(s, sharpness) };
        } catch (e) { return null; }
      }

      // 兼容已发出的旧链接；它们丢失的精度和个性句子无法恢复。
      var m = /^#?g-([a-z]+)-([a-s]{4})$/.exec(hash || '');
      if (!m || !byId[m[1]]) return null;
      var s = m[2].split('').map(function (ch) { return (ch.charCodeAt(0) - 97 - 9) / 9; });
      var cat = catForScores(s);
      var id = m[1];
      var hidden = byId[id].hidden ? id : null;
      // 普通猫的 id 必须和维度对得上，对不上就以维度为准
      return { s: s, catId: cat.id, hiddenId: hidden, mix: mix(s), legacy: true };
    }

    return {
      ALL: ALL, byId: byId, maxAbs: maxAbs,
      weights: weights, answered: answered, scores: scores, signs: signs,
      catForSigns: catForSigns, catForScores: catForScores, mix: mix, result: result,
      lean: lean, code: code, soulmate: soulmate, buddy: buddy, pair: pair, guessDiff: guessDiff,
      encode: encode, decode: decode
    };
  }

  var API = { create: create };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.MaogeEngine = API;
})(this);
