/* CATI · PRO：页面逻辑（版式和语气跟原版 cati 一致） */
(function () {
  'use strict';
  var D = window.MAOGE_DATA;
  var E = window.MaogeEngine.create(D);
  var A = window.CatArt;
  var Q = D.QUESTIONS;
  var FONT = '-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif';
  var INK = '#2A2A28', INK2 = '#7C7B76', INK3 = '#9A988F', PAGE = '#F4F2EC', BG = '#F7F5F0', BORDER = '#D9D6CD', PANEL = '#EDEAE2';

  var state = { idx: 0, answers: {}, friend: null, friendHash: '', result: null };
  var uidN = 0;

  // ---------- 小工具 ----------
  function $(s, r) { return (r || document).querySelector(s); }
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v; // 只用于本站生成的 SVG
      else if (k === 'on') Object.keys(v).forEach(function (ev) { e.addEventListener(ev, v[ev]); });
      else e.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  // 拉开字距的小标题里，ta、CP 这种拉丁字母不拉开，不然会变成「t a」
  function spacedKids(text) {
    return text.split(/([A-Za-z]+)/).filter(Boolean).map(function (part) {
      return /^[A-Za-z]+$/.test(part) ? h('span', { class: 'lat', text: part }) : part;
    });
  }
  function art(id, crop, size) { return A.svg(id, { crop: crop, uid: 'u' + (++uidN), size: size }); }
  function rgba(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }
  function banner(c) { return 'background:linear-gradient(180deg,' + rgba(c.color, 0.22) + ',' + rgba(c.color, 0.05) + ' 60%,transparent)'; }
  function cat(id) { return E.byId[id]; }
  function form(r) { return E.catForScores(r.s); }
  function mainOf(r) { return cat(r.hiddenId || r.catId); }
  function full(c) { return c.name + '·' + c.title; }
  function reduceMotion() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('maoge:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('maoge:' + k, JSON.stringify(v)); } catch (e) { /* 无痕模式下存不了，不影响测试 */ } }
  };

  // ---------- 原版的黑猫动画 ----------
  var anims = {};
  function mountCat(id) {
    var el = document.getElementById(id);
    if (!el || !window.lottie || !window.BAD_CAT) return;
    if (anims[id]) { try { anims[id].destroy(); } catch (e) { /* 已经销毁 */ } }
    el.innerHTML = '';
    anims[id] = window.lottie.loadAnimation({
      container: el, renderer: 'svg', loop: true, autoplay: !reduceMotion(),
      animationData: JSON.parse(JSON.stringify(window.BAD_CAT))
    });
  }

  var SCREENS = ['cover', 'quiz', 'result', 'guess', 'gallery'];
  var current = 'cover';
  function show(name) {
    current = name;
    SCREENS.forEach(function (s) {
      var el = $('#s-' + s);
      el.hidden = s !== name;
      el.classList.remove('enter');
    });
    var on = $('#s-' + name);
    void on.offsetWidth;
    on.classList.add('enter');
    Object.keys(anims).forEach(function (id) {
      var a = anims[id], el = document.getElementById(id);
      if (!a || !el) return;
      if (on.contains(el) && !reduceMotion()) a.play(); else a.pause();
    });
    window.scrollTo(0, 0);
  }

  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2400);
  }

  function baseUrl() { return location.href.split('#')[0]; }
  function shareLink(r, direct) { return baseUrl() + '#' + E.encode(r) + (direct ? '/result' : ''); }

  function copy(text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    }
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); });
    }
    return Promise.resolve(fallback());
  }

  // ---------- 封面 ----------
  function renderCover() {
    mountCat('cover-cat');
    var me = store.get('me', null);
    var btn = $('#btn-me');
    if (me && E.byId[me.catId]) {
      var mc = mainOf(me);
      btn.innerHTML = '';
      btn.appendChild(h('span', { class: 'mini', html: art(mc.id, 'head') }));
      btn.appendChild(h('span', null, [h('b', { text: '上次测出：' + full(mc) }), h('small', { text: '点开看结果' })]));
      btn.hidden = false;
    } else btn.hidden = true;
  }

  // ---------- 答题 ----------
  function startQuiz() {
    state.idx = 0; state.answers = {};
    mountCat('q-cat');
    renderQ(); show('quiz');
  }

  function fishUsed(a) { return a.fish.reduce(function (x, y) { return x + y; }, 0); }

  function renderQ() {
    var q = Q[state.idx];
    var a = state.answers[q.id] || (q.type === 'fish' ? { fish: [0, 0, 0, 0] } : { sel: [] });
    state.answers[q.id] = a;

    $('#count').textContent = (state.idx + 1) + ' / ' + Q.length;
    $('#bar-fill').style.width = ((state.idx + 1) / Q.length * 100) + '%';
    $('#q-title').textContent = q.title;
    var hint = q.type === 'multi' ? '' : q.type === 'fish' ? '点选项放一颗小鱼干' : '选一个';
    $('#q-hint').textContent = hint;
    $('#q-hint').hidden = !hint;

    var box = $('#opts');
    box.innerHTML = '';
    q.options.forEach(function (o, i) {
      if (q.type === 'fish') {
        var n = a.fish[i];
        var fishes = h('span', { class: 'fishes', 'aria-hidden': 'true' });
        for (var k = 0; k < 3; k++) fishes.insertAdjacentHTML('beforeend', '<svg class="' + (k < n ? '' : 'off') + '"><use href="#i-fish"/></svg>');
        var b = h('button', {
          class: 'opt', type: 'button', 'aria-pressed': n > 0 ? 'true' : 'false',
          'aria-label': o.t + '，已放 ' + n + ' 颗小鱼干',
          on: { click: function () { addFish(i); } }
        }, [h('span', { class: 'txt', text: o.t }), fishes]);
        var row = h('div', { class: 'fish-row' }, [b]);
        if (n > 0) row.appendChild(h('button', { class: 'minus', type: 'button', 'aria-label': '从「' + o.t + '」拿回一颗', text: '−', on: { click: function () { removeFish(i); } } }));
        box.appendChild(row);
      } else {
        var on = a.sel.indexOf(i) >= 0;
        box.appendChild(h('button', {
          class: 'opt' + (q.type === 'multi' ? ' multi' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false',
          on: { click: function () { pick(i); } }
        }, [h('span', { class: 'dot', 'aria-hidden': 'true' }), h('span', { class: 'txt', text: o.t })]));
      }
    });

    var fishLeft = $('#fish-left'), reset = $('#btn-fish-reset');
    if (q.type === 'fish') {
      var used = fishUsed(a);
      fishLeft.hidden = false;
      fishLeft.textContent = used < 3 ? '还剩 ' + (3 - used) + ' 颗小鱼干' : '分好啦(๑•̀ㅂ•́)و';
      reset.hidden = used === 0;
    } else { fishLeft.hidden = true; reset.hidden = true; }

    var next = $('#btn-next');
    next.textContent = state.idx === Q.length - 1 ? '看结果' : '下一题';
    next.disabled = q.type === 'fish' ? fishUsed(a) < 3 : !E.answered(q, a);
    $('#btn-back').setAttribute('aria-label', state.idx === 0 ? '回到首页' : '上一题');
  }

  function pick(i) {
    var q = Q[state.idx], a = state.answers[q.id];
    if (q.type === 'multi') {
      var at = a.sel.indexOf(i);
      if (at >= 0) a.sel.splice(at, 1);
      else { a.sel.push(i); if (a.sel.length > 2) a.sel.shift(); }
      renderQ();
      return;
    }
    a.sel = [i];
    renderQ();
    setTimeout(next, reduceMotion() ? 0 : 300);
  }
  function addFish(i) {
    var a = state.answers[Q[state.idx].id];
    if (fishUsed(a) >= 3) { toast('3 颗都分完啦，点「−」可以拿回来'); return; }
    a.fish[i]++; renderQ();
  }
  function removeFish(i) {
    var a = state.answers[Q[state.idx].id];
    if (a.fish[i] > 0) a.fish[i]--;
    renderQ();
  }

  function next() {
    var q = Q[state.idx], a = state.answers[q.id];
    if (q.type === 'fish' ? fishUsed(a) < 3 : !E.answered(q, a)) return;
    if (state.idx < Q.length - 1) { state.idx++; renderQ(); window.scrollTo(0, 0); }
    else finish();
  }
  function back() {
    if (state.idx === 0) { renderCover(); show('cover'); return; }
    state.idx--; renderQ();
  }

  function finish() {
    var r = E.result(state.answers);
    store.set('me', { s: r.s, catId: r.catId, hiddenId: r.hiddenId, says: r.says, mixSharpness: r.mixSharpness, ts: Date.now() });
    state.result = r;
    renderResult(r);
    show('result');
  }

  // ---------- 结果页的块 ----------
  function heroBlock(r, label) {
    var c = mainOf(r), f = form(r);
    return h('div', { class: 'res-hero', style: banner(c) }, [
      h('span', { class: 'no', text: 'NO.' + c.no }),
      c.hidden ? h('span', { class: 'badge', text: '隐藏款' }) : null,
      h('div', { class: 'res-cat anim', html: art(c.id, 'full') }),
      h('div', { class: 'spaced' }, spacedKids(label || '你的猫系生活型')),
      h('h2', { class: 'res-name', text: c.name }),
      h('p', { class: 'res-title', text: '—— ' + c.title }),
      c.hidden ? h('p', { class: 'res-form', text: '猫形态：' + full(f) }) : null
    ]);
  }

  function descBox(c) {
    return h('div', { class: 'box' }, [
      h('p', { class: 'desc', text: c.desc }),
      h('div', { class: 'twin' }, [
        h('div', null, [h('small', { text: '别人眼中' }), h('p', { text: c.seen })]),
        h('div', null, [h('small', { text: '其实' }), h('p', { text: c.real })])
      ])
    ]);
  }

  // 「你身上还带点 X 的影子」：成分表的第二、第三名，按前三名之间的比例换算
  function subCats(r, who) {
    var top = E.mix(r.s, r.mixSharpness).slice(0, 3);
    var sum = top.reduce(function (x, y) { return x + y.p; }, 0);
    var box = h('div', { class: 'sub-cats' });
    top.forEach(function (m, i) {
      var c = cat(m.id), pct = Math.round(m.p / sum * 100) + '%';
      var text = i === 0
        ? [(who || '你') + '有 ', h('b', { text: pct }), ' 是 ', h('b', { text: full(c) })]
        : [(who || '你') + '身上还带点 ', h('b', { text: full(c) }), ' 的影子'];
      box.appendChild(h('div', { class: 'sub-cat' }, [
        h('span', { class: 'mini', html: art(c.id, 'head') }),
        h('span', null, text),
        i === 0 ? null : h('span', { class: 'pct', text: pct })
      ]));
    });
    return box;
  }

  function chartBox(r, who) {
    var box = h('div', { class: 'dims' });
    r.s.forEach(function (s, i) {
      var d = D.DIMS[i], pos = (1 - s) / 2 * 100;
      var fill = s >= 0 ? 'left:' + pos + '%;width:' + (50 - pos) + '%' : 'left:50%;width:' + (pos - 50) + '%';
      box.appendChild(h('div', { class: 'dim' }, [
        h('span', { class: 'l ' + (s >= 0 ? 'on' : 'off'), text: d.pos.name }),
        h('div', { class: 'track', role: 'img', 'aria-label': d.pos.name + '和' + d.neg.name + '之间，' + E.lean(s, i).text }, [h('span', { class: 'fill', style: fill })]),
        h('span', { class: 'r ' + (s < 0 ? 'on' : 'off'), text: d.neg.name }),
        h('span', { class: 'dim-lean', text: E.lean(s, i).text })
      ]));
    });
    return h('div', { class: 'box' }, [h('p', { class: 'box-title' }, spacedKids((who || '你') + '的性格四维')), box]);
  }

  function tagsRow(c) {
    var t = h('div', { class: 'tags' });
    c.tags.forEach(function (x) { t.appendChild(h('span', { class: 'tag', text: x })); });
    return t;
  }

  function saysBox(says, who) {
    if (!says || !says.length) return null;
    var ul = h('ul', { class: 'says' });
    says.forEach(function (s) { ul.appendChild(h('li', { text: s })); });
    return h('div', { class: 'box' }, [h('p', { class: 'box-title', text: '从' + (who || '你') + '的答案里看到' }), ul]);
  }

  // 最佳配对、最佳友伴，跟原版一样
  function pairBox(c, f) {
    var mate = E.soulmate(f), bud = E.buddy(f);
    function link(x) { return h('button', { type: 'button', text: full(x), on: { click: function () { openCat(x.id); } } }); }
    return h('div', { class: 'pair-box' }, [
      h('div', { class: 'pair-item' }, ['最佳配对小猫：', link(mate), '（' + f.combo + '）']),
      h('div', { class: 'pair-item' }, ['最佳友伴小猫：', link(bud)])
    ]);
  }

  function relationBox(meR, frR, withButton) {
    var p = E.pair(form(meR).v, form(frR).v);
    var mc = mainOf(meR), fc = mainOf(frR);
    var ul = h('ul', { class: 'rel-lines' });
    p.lines.forEach(function (l) { ul.appendChild(h('li', { text: l })); });
    return h('div', { class: 'box' }, [
      h('p', { class: 'box-title' }, spacedKids('你和 ta 的猫猫 CP')),
      h('div', { class: 'duo' }, [
        h('div', { class: 'mini', style: banner(mc) }, [h('div', { html: art(mc.id, 'head') }), h('b', { text: mc.name }), h('small', { text: '你' })]),
        h('span', { class: 'x', text: '×' }),
        h('div', { class: 'mini', style: banner(fc) }, [h('div', { html: art(fc.id, 'head') }), h('b', { text: fc.name }), h('small', { text: 'ta' })])
      ]),
      h('p', { class: 'rel-name', text: p.title.name }),
      h('p', { class: 'rel-sub', text: p.title.sub }),
      ul,
      withButton ? h('button', { class: 'btn btn-ghost', type: 'button', text: '生成 CP 卡', on: { click: function () { openPairPoster(meR, frR); } } }) : null
    ]);
  }

  // ---------- 结果页 ----------
  function renderResult(r) {
    var root = $('#s-result');
    root.innerHTML = '';
    var c = mainOf(r), f = form(r);
    root.appendChild(heroBlock(r));
    root.appendChild(descBox(c));
    root.appendChild(subCats(r));
    root.appendChild(chartBox(r));
    root.appendChild(tagsRow(c));
    var sb = saysBox(r.says);
    if (sb) root.appendChild(sb);
    root.appendChild(pairBox(c, f));
    if (state.friend) root.appendChild(relationBox(r, state.friend, true));

    var linkbox = h('p', { class: 'linkbox', hidden: true });
    root.appendChild(h('div', { class: 'actions' }, [
      h('div', { class: 'btn-row' }, [
        h('button', { class: 'btn btn-ghost', type: 'button', text: '再测一次', on: { click: startQuiz } }),
        h('button', { class: 'btn btn-ghost', type: 'button', text: '猫猫图鉴', on: { click: openGallery } })
      ]),
      h('button', { class: 'btn btn-primary', type: 'button', text: '分享给朋友', on: { click: function () { shareResult(r, linkbox); } } }),
      h('button', { class: 'btn btn-ghost', type: 'button', text: '生成分享图', on: { click: function () { openPoster(r); } } }),
      linkbox
    ]));
  }

  function shareResult(r, linkbox) {
    var link = shareLink(r);
    store.set('lastShare', E.encode(r));
    var text = D.META.shareText + ' ' + link;
    linkbox.textContent = link; linkbox.hidden = false;
    // 先在点击里复制（微信里没有系统分享），再试着打开系统分享
    var copied = copy(text);
    function report() { copied.then(function (ok) { toast(ok ? '已复制，去微信 / QQ 粘贴发送吧' : '复制没成功，长按下面的链接手动复制'); }); }
    if (navigator.share) {
      navigator.share({ title: D.META.name, text: D.META.shareText, url: link }).catch(function (e) {
        if (e && e.name === 'AbortError') return;
        report();
      });
      return;
    }
    report();
  }

  // ---------- 朋友链接：先猜，再揭晓 ----------
  function renderGuess() {
    var root = $('#s-guess');
    root.innerHTML = '';
    root.appendChild(h('div', { class: 'guess-head' }, [
      h('div', { class: 'spaced', text: '先猜再看' }),
      h('h1', { text: '猜猜 ta 是哪只小猫' }),
      h('p', { text: '猜对了，说明你懂 ta(｀・ω・´)' })
    ]));
    if (state.friend.legacy) root.appendChild(legacyNotice());
    var grid = h('div', { class: 'pick-grid' });
    D.CATS.forEach(function (c) {
      grid.appendChild(h('button', { class: 'pick', type: 'button', 'aria-label': '猜 ta 是' + c.name, on: { click: function () { reveal(c.id); } } }, [
        h('div', { html: art(c.id, 'head') }), h('span', { text: c.name })
      ]));
    });
    root.appendChild(grid);
    root.appendChild(h('button', { class: 'link', type: 'button', text: '猜不出来，直接看答案', on: { click: function () { reveal(null); } } }));
  }

  function legacyNotice() {
    return h('p', { class: 'verdict-sub', text: '这是旧版链接，分数和细节未完整保留。请 ta 重新分享，查看完整结果。' });
  }

  function joinNames(list) {
    var names = list.map(function (x) { return x.name; });
    if (names.length <= 1) return names.join('');
    return names.slice(0, -1).join('、') + '和' + names[names.length - 1];
  }

  function reveal(guessId, direct) {
    var f = state.friend, root = $('#s-guess');
    var real = form(f), main = mainOf(f);
    var verdict, sub;
    if (direct) { verdict = ''; sub = ''; }
    else if (!guessId) { verdict = 'ta 是' + main.name; sub = '下次先猜一下嘛，猜错才好玩(￣▽￣)'; }
    else {
      // 猜错的每个维度，按 ta 真实的方向给一句话
      var g = cat(guessId), diff = E.guessDiff(g.v, real.v);
      var lines = diff.map(function (d) { return D.GUESS[d.key][d.real]; });
      if (diff.length === 0) { verdict = '猜中了！(≧▽≦)'; sub = '世界上还能找到第二个像你这么懂 ta 的人吗？！'; }
      else if (diff.length === 1) { verdict = '差一点！(｡•́︿•̀｡)'; sub = '你猜的是' + g.name + '，只差一处：' + lines[0]; }
      else if (diff.length === 2) { verdict = '猜对了一半'; sub = '你猜的是' + g.name + '。' + lines.join(''); }
      else if (diff.length === 3) { verdict = 'ta 藏得有点深(・_・?)'; sub = '你猜的是' + g.name + '。' + lines.slice(0, 2).join('') + '剩下那一处，你自己去问 ta 吧。'; }
      else { verdict = '完美错过(°ー°〃)'; sub = '你猜的是' + g.name + '，全猜反了。这也算一种默契吧。'; }
    }
    if (main.hidden && !direct) sub += '而且 ta 测出了隐藏款「' + main.name + '」！';

    // 记进图鉴
    var friends = store.get('friends', []);
    friends = friends.filter(function (x) { return x.hash !== state.friendHash; });
    friends.unshift({ hash: state.friendHash, s: f.s, catId: f.catId, hiddenId: f.hiddenId, guess: guessId, ts: Date.now() });
    store.set('friends', friends.slice(0, 60));

    root.innerHTML = '';
    root.appendChild(heroBlock(f, 'ta 的猫系生活型'));
    if (verdict) root.appendChild(h('p', { class: 'verdict', text: verdict }));
    if (sub) root.appendChild(h('p', { class: 'verdict-sub', text: sub }));
    if (f.legacy) root.appendChild(legacyNotice());
    root.appendChild(descBox(main));
    root.appendChild(subCats(f, 'ta '));
    root.appendChild(chartBox(f, 'ta '));
    root.appendChild(tagsRow(main));
    var sb = saysBox(f.says, ' ta ');
    if (sb) root.appendChild(sb);
    root.appendChild(pairBox(main, real));

    var me = store.get('me', null);
    if (me && E.byId[me.catId]) {
      root.appendChild(relationBox(me, f, true));
      root.appendChild(h('div', { class: 'btn-row' }, [
        h('button', { class: 'btn btn-ghost', type: 'button', text: '看我的结果', on: { click: showMine } }),
        h('button', { class: 'btn btn-ghost', type: 'button', text: '再测一次', on: { click: startQuiz } })
      ]));
    } else {
      root.appendChild(h('button', { class: 'btn btn-primary', type: 'button', text: '测测我是哪只小猫', on: { click: startQuiz } }));
    }
    root.appendChild(h('button', { class: 'btn btn-ghost', type: 'button', text: '猫猫图鉴', on: { click: openGallery } }));
    show('guess');
  }

  function showMine() {
    var me = store.get('me', null);
    if (!me || !E.byId[me.catId]) { startQuiz(); return; }
    var r = { s: me.s, catId: me.catId, hiddenId: me.hiddenId, says: me.says || [], mixSharpness: me.mixSharpness };
    state.result = r;
    renderResult(r); show('result');
  }

  // ---------- 图鉴 ----------
  function collected() {
    var me = store.get('me', null), friends = store.get('friends', []);
    var who = {};
    function add(id, label) { if (!id) return; who[id] = who[id] || []; if (who[id].indexOf(label) < 0) who[id].push(label); }
    if (me) { add(me.hiddenId, '我'); add(me.catId, '我'); }
    friends.forEach(function (f) { add(f.hiddenId, '朋友'); add(f.catId, '朋友'); });
    return who;
  }

  function galleryCard(c, who) {
    var mine = who[c.id], locked = c.hidden && !mine;
    var tags = h('div', { class: 'g-tags' });
    if (!locked) c.tags.forEach(function (t) { tags.appendChild(h('span', { class: 'g-tag', text: t })); });
    var kids = [
      h('div', { class: 'g-head' }, [
        h('span', { class: 'g-icon' + (locked ? ' locked' : ''), html: art(c.id, 'head') }),
        h('div', null, [
          h('div', { class: 'g-no', text: 'NO.' + c.no }),
          h('div', { class: 'g-name', text: locked ? '???' : full(c).replace('·', ' · ') }),
          tags
        ]),
        mine ? h('span', { class: 'g-who', text: mine.slice(0, 2).join('、') }) : null
      ]),
      h('p', { class: 'g-desc', text: locked ? (c.id === 'dog' ? '据说藏在最后一题里。' : '据说只有五五开的人，才遇得到它。') : c.desc })
    ];
    if (!locked && c.v) {
      // 两段各自成块，换行只发生在两段之间，不会把「孟加拉猫」拆开
      kids.push(h('p', { class: 'g-pair' }, [
        h('span', { text: '最佳配对：' + E.soulmate(c).name + '（' + c.combo + '）｜' }),
        h('span', { text: '最佳友伴：' + E.buddy(c).name })
      ]));
    }
    return h('div', { class: 'g-card', id: 'g-' + c.id }, kids);
  }

  function openGallery() {
    var root = $('#s-gallery'), who = collected();
    var back = current === 'gallery' ? 'cover' : current;
    root.innerHTML = '';
    var got = D.CATS.filter(function (c) { return who[c.id]; }).length;
    root.appendChild(h('div', { class: 'gallery-head' }, [
      h('button', { class: 'g-back', type: 'button', text: '← 返回', on: { click: function () { if (back === 'cover') renderCover(); show(back); } } }),
      h('h1', { class: 'g-title', text: '猫猫图鉴' }),
      h('span', { class: 'g-count', text: '已集 ' + got + ' / 16' })
    ]));
    var list = h('div', { class: 'gallery-list' });
    D.CATS.concat(D.HIDDEN).forEach(function (c) { list.appendChild(galleryCard(c, who)); });
    root.appendChild(list);
    show('gallery');
  }

  // ---------- 弹层 ----------
  var lastFocus = null;
  function openSheet(title, kids) {
    var sheet = $('#sheet');
    if ($('#overlay').hidden) lastFocus = document.activeElement;
    sheet.innerHTML = '';
    var close = h('button', { class: 'x-btn', type: 'button', 'aria-label': '关闭', text: '×', on: { click: closeSheet } });
    sheet.appendChild(h('div', { class: 'sheet-top' }, [h('b', { id: 'sheet-title', text: title }), close]));
    kids.forEach(function (k) { if (k) sheet.appendChild(k); });
    $('#overlay').hidden = false;
    document.body.style.overflow = 'hidden';
    sheet.scrollTop = 0;
    close.focus();
  }
  function closeSheet() {
    $('#overlay').hidden = true;
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function openCat(id) {
    var c = cat(id);
    var hero = h('div', { class: 'res-hero', style: banner(c) }, [
      h('span', { class: 'no', text: 'NO.' + c.no }),
      h('div', { class: 'res-cat anim', html: art(c.id, 'full') }),
      h('h2', { class: 'res-name', text: c.name }),
      h('p', { class: 'res-title', text: '—— ' + c.title })
    ]);
    openSheet('NO.' + c.no + ' ' + c.name, [hero, descBox(c), tagsRow(c), c.v ? pairBox(c, c) : null]);
  }

  // ---------- 结果图（Canvas） ----------
  function loadSvg(svg) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = rej;
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }
  function wrap(ctx, text, maxW) {
    var lines = [], line = '';
    Array.from(text).forEach(function (ch) {
      var t = line + ch;
      if (ctx.measureText(t).width > maxW && line) {
        if (/[，。、；：！？」）]/.test(ch)) { lines.push(t); line = ''; return; }
        lines.push(line); line = ch;
      } else line = t;
    });
    if (line) lines.push(line);
    return lines;
  }
  function font(w, size) { return w + ' ' + size + 'px ' + FONT; }
  // 拉开字距的小标签，跟页面上的「你 的 猫 系 生 活 型」一样
  function spacedText(ctx, text, cx, y, gap) {
    var chars = Array.from(text), widths = chars.map(function (ch) { return ctx.measureText(ch).width; });
    var total = widths.reduce(function (a, b) { return a + b; }, 0) + gap * (chars.length - 1);
    var x = cx - total / 2;
    ctx.textAlign = 'left';
    chars.forEach(function (ch, i) { ctx.fillText(ch, x, y); x += widths[i] + gap; });
  }
  function drawQR(ctx, text, x, y, size) {
    var qr = window.qrcode(0, 'M');
    qr.addData(text); qr.make();
    var n = qr.getModuleCount(), q = 2, cell = size / (n + q * 2);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x, y, size, size);
    ctx.fillStyle = INK;
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(Math.floor(x + (c + q) * cell), Math.floor(y + (r + q) * cell), Math.ceil(cell), Math.ceil(cell));
    }
  }
  function bannerFill(ctx, c, x, y, w, hh) {
    var g = ctx.createLinearGradient(0, y, 0, y + hh);
    g.addColorStop(0, rgba(c.color, 0.24)); g.addColorStop(0.6, rgba(c.color, 0.06)); g.addColorStop(1, rgba(c.color, 0));
    ctx.fillStyle = g; ctx.fillRect(x, y, w, hh);
  }

  function drawResultPoster(r, guessing) {
    // 猜猜版所有结果使用同一个造型和配色，编号、称号也不提前揭晓。
    var c = guessing ? { color: '#C9C5BD' } : mainOf(r);
    var link = shareLink(r, !guessing);
    var W = 1080, H = 1440;
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    var AW = 780, AH = Math.round(780 * A.aspect);
    return loadSvg(A.svg(guessing ? 'mystery' : c.id, { uid: 'pst', size: AW })).then(function (img) {
      ctx.fillStyle = PAGE; ctx.fillRect(0, 0, W, H);
      bannerFill(ctx, c, 0, 0, W, 980);
      ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.font = font(800, 40); ctx.fillText(D.META.name, 64, 92);
      if (!guessing) {
        ctx.fillStyle = INK2; ctx.textAlign = 'right'; ctx.font = font(400, 26); ctx.fillText('NO.' + c.no, W - 64, 90);
      }
      if (c.hidden) {
        ctx.font = font(600, 26); var bw = ctx.measureText('隐藏款').width + 36;
        ctx.fillStyle = INK; ctx.fillRect(W - 64 - bw, 112, bw, 46);
        ctx.fillStyle = PAGE; ctx.textAlign = 'center'; ctx.fillText('隐藏款', W - 64 - bw / 2, 144);
      }
      ctx.drawImage(img, (W - AW) / 2, 150, AW, AH);
      ctx.fillStyle = INK2; ctx.font = font(400, 28);
      spacedText(ctx, guessing ? '猜猜我的猫系生活型' : '我的猫系生活型', W / 2, 726, 9);
      ctx.fillStyle = INK; ctx.textAlign = 'center';
      ctx.font = font(800, guessing ? 80 : 112); ctx.fillText(guessing ? '我是哪只小猫？' : c.name, W / 2, 846);
      ctx.font = font(600, guessing ? 36 : 44); ctx.fillText(guessing ? '答案先保密，等你来猜(￣▽￣)' : '—— ' + c.title, W / 2, 914);
      // 下方的方框：二维码 + 一句钩子
      var px = 56, py = 1000, pw = W - px * 2, ph = 352;
      ctx.fillStyle = BG; ctx.fillRect(px, py, pw, ph);
      ctx.lineWidth = 2; ctx.strokeStyle = BORDER; ctx.strokeRect(px, py, pw, ph);
      var qr = 236, qx = px + pw - qr - 32, qy = py + 32;
      drawQR(ctx, link, qx, qy, qr);
      var tx = px + 40, tw = qx - tx - 30;
      ctx.textAlign = 'left'; ctx.fillStyle = INK; ctx.font = font(700, 38);
      ctx.fillText(guessing ? '这次，轮到你来猜' : '你觉得像我吗？', tx, py + 80);
      ctx.font = font(400, 28); ctx.fillStyle = INK2;
      var lines = guessing ? ['凭你对我的了解，', '第一直觉会是哪只？'] : wrap(ctx, '别人眼中：' + c.seen, tw).concat(wrap(ctx, '其实：' + c.real, tw));
      lines.slice(0, 4).forEach(function (l, i) { ctx.fillText(l, tx, py + 136 + i * 40); });
      ctx.font = font(400, 22); ctx.fillStyle = INK3;
      ctx.fillText(guessing ? '扫码选一只，再揭晓答案' : '扫码看完整结果', tx, py + ph - 28);
      ctx.textAlign = 'center'; ctx.fillStyle = INK3; ctx.font = font(400, 24);
      ctx.fillText(D.META.name + '｜测测你是哪只小猫', W / 2, H - 34);
      return cv.toDataURL('image/png');
    });
  }

  function drawPairPoster(meR, frR) {
    var mc = mainOf(meR), fc = mainOf(frR), p = E.pair(form(meR).v, form(frR).v);
    var link = shareLink(meR, true);
    var W = 1080, H = 1440;
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    var AW = 460, AH = Math.round(460 * A.aspect);
    return Promise.all([loadSvg(A.svg(mc.id, { uid: 'pa', size: AW })), loadSvg(A.svg(fc.id, { uid: 'pb', size: AW }))]).then(function (imgs) {
      ctx.fillStyle = PAGE; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.font = font(800, 40); ctx.fillText(D.META.name, 64, 92);
      ctx.fillStyle = INK2; ctx.textAlign = 'right'; ctx.font = font(400, 26); ctx.fillText('猫猫 CP 卡', W - 64, 90);
      [[mc, 40, imgs[0], '我'], [fc, 560, imgs[1], 'ta']].forEach(function (x) {
        bannerFill(ctx, x[0], x[1], 140, 480, 560);
        ctx.lineWidth = 2; ctx.strokeStyle = BORDER; ctx.strokeRect(x[1], 140, 480, 560);
        ctx.drawImage(x[2], x[1] + 10, 230, AW, AH);
        ctx.textAlign = 'center'; ctx.fillStyle = INK; ctx.font = font(800, 52); ctx.fillText(x[0].name, x[1] + 240, 628);
        ctx.fillStyle = INK2; ctx.font = font(400, 28); ctx.fillText(x[3], x[1] + 240, 674);
      });
      ctx.fillStyle = INK2; ctx.font = font(300, 64); ctx.textAlign = 'center'; ctx.fillText('×', W / 2, 440);
      ctx.fillStyle = INK; ctx.font = font(800, 96); ctx.fillText(p.title.name, W / 2, 836);
      ctx.font = font(400, 32); ctx.fillStyle = INK2; ctx.fillText(p.title.sub, W / 2, 892);
      ctx.textAlign = 'left'; ctx.fillStyle = INK; ctx.font = font(400, 31);
      var y = 966;
      p.lines.forEach(function (l) {
        wrap(ctx, '· ' + l, W - 150).forEach(function (ln, i) { ctx.fillText(i ? '　' + ln : ln, 76, y); y += 46; });
        y += 8;
      });
      var qr = 160; drawQR(ctx, link, W - 76 - qr, H - 64 - qr, qr);
      ctx.font = font(400, 26); ctx.fillStyle = INK2;
      ctx.fillText('扫码看我的完整结果', 76, H - 122);
      ctx.fillStyle = INK3; ctx.fillText(D.META.name + '｜测测你是哪只小猫', 76, H - 80);
      return cv.toDataURL('image/png');
    });
  }

  function posterSheet(title, promise, note) {
    var holder = h('p', { class: 'poster-note', text: '正在画…' });
    openSheet(title, [holder]);
    promise.then(function (url) {
      holder.replaceWith(h('img', { class: 'poster', src: url, alt: title }));
      $('#sheet').appendChild(h('p', { class: 'poster-note', text: note }));
    }).catch(function () {
      holder.textContent = '图片没画出来，可以直接截图这一页(｡•́︿•̀｡)';
    });
  }
  function openPoster(r) {
    function choice(title, detail, guessing) {
      return h('button', { class: 'btn poster-choice ' + (guessing ? 'btn-primary' : 'btn-ghost'), type: 'button', on: { click: function () {
        posterSheet(guessing ? '猜猜版分享图' : '结果版分享图', drawResultPoster(r, guessing), '长按图片保存，发给 ta 吧');
      } } }, [
        h('span', { class: 'poster-choice-cat', html: art(guessing ? 'mystery' : mainOf(r).id, 'full') }),
        h('span', { class: 'poster-choice-copy' }, [h('b', { text: title }), h('small', { text: detail })])
      ]);
    }
    openSheet('想怎么分享？', [
      choice('让 ta 猜猜', '先不剧透，扫码猜完再揭晓', true),
      choice('晒出我的结果', '展示猫型，扫码看完整结果', false)
    ]);
  }
  function openPairPoster(meR, frR) { posterSheet('CP 卡', drawPairPoster(meR, frR), '长按图片保存，发给 ta 吧'); }

  // ---------- 路由 ----------
  function route() {
    var hash = location.hash || '';
    var direct = /\/result$/.test(hash);
    if (direct) hash = hash.slice(0, -7);
    if (/^#(?:g-|r2-)/.test(hash)) {
      var f = E.decode(hash);
      if (f) {
        if (!f.legacy && store.get('lastShare', '') === hash.slice(1)) {
          state.friend = null; state.result = f;
          renderResult(f); show('result'); toast('这是你自己的分享链接'); return;
        }
        state.friend = f; state.friendHash = hash.slice(1);
        if (direct) reveal(null, true);
        else { renderGuess(); show('guess'); }
        return;
      }
    }
    renderCover();
    if (hash === '#gallery') { openGallery(); return; }
    show('cover');
  }

  $('#btn-start').addEventListener('click', function () { state.friend = null; startQuiz(); });
  $('#btn-me').addEventListener('click', showMine);
  $('#btn-gallery').addEventListener('click', openGallery);
  $('#btn-next').addEventListener('click', next);
  $('#btn-back').addEventListener('click', back);
  $('#btn-fish-reset').addEventListener('click', function () { state.answers[Q[state.idx].id] = { fish: [0, 0, 0, 0] }; renderQ(); });
  $('#overlay').addEventListener('click', function (e) { if (e.target.id === 'overlay') closeSheet(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('#overlay').hidden) closeSheet(); });
  window.addEventListener('hashchange', route);
  route();
})();
