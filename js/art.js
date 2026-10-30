/* CATI · PRO：猫咪画像
 * 所有猫都用原版 cati 那只黑猫的同一个轮廓、同一条尾巴、同一种眼睛，坐标就是原版动画里的坐标。
 * 每只猫只换毛色、花纹、眼神，最多加一件小道具。
 *
 * 画法规则：
 *   - 剪影本身不描边；轮廓外侧垫一圈细边，好在米色纸面上分开：深色猫垫白边（原版就是这样），浅色猫垫深一点的毛色。
 *   - 条纹是从轮廓边缘长进来的尖细楔形；胸口的浅色从下巴连到地面；色块是不规则的圆润形状；不用渐变。
 *   - 眼睛 = 白眼球 + 垂着的瞳孔，上半截被眼皮挡住。眼皮不单独画颜色，而是用遮罩把眼球的上半截“剪掉”，
 *     露出来的就是脸本身的颜色，所以眼睛落在哪块花色上都对得上。眼神只靠眼皮高低和瞳孔位置变化。
 *
 * CatArt.svg(id, { crop: 'head' | 'full', uid, size }) 返回一段 SVG 字符串。
 * 眼皮在 .ca-lid 里、尾巴在 .ca-tail 里，页面用 CSS 让它们眨眼、甩尾巴。
 */
(function (root) {
  var INK = '#2A2A28';
  var EYE_WHITE = '#EDEDED';
  var n = 0;
  // 下面四样都是原版动画第 0 帧的形状
  var BODY = 'M118.88,112.25 C110.38,133.75 112.25,172 114,183.25 C115.75,194.5 123.25,199 126,231.75 C128.75,264.5 130,293.25 130,293.25 C130,293.25 120.45,294.01 123,302.5 C123.75,305 122.75,305 127.75,305 C132.75,305 252.5,305 252.5,305 C252.5,305 254.5,300 255.5,291.5 C256.5,283 260,274.5 250,237.5 C240,200.5 226,198 224.5,180.5 C223,163 223,143.5 214,116 C205,88.5 199.34,115.7 197,123.5 C196.62,124.75 161.44,117.86 133.88,124.75 C133,125 127.38,90.75 118.88,112.25 Z';
  var TAIL = 'M254.43,293.87 C263.47,293.87 300.7,305.5 322.51,261.53 C344.32,217.56 368.25,215.54 368.25,215.54';
  var CUP = 'M52.53,239.02 C52.36,239.19 52.21,240.77 52.21,242.52 C52.21,246.83 51.65,247.39 47.78,246.9 C46.82,246.78 45.23,246.73 44.32,246.74 L44.32,251.56 C45.52,251.65 47.36,252.07 48.45,252.85 C52.26,255.57 53.95,274.32 50.84,279.48 C42.78,292.84 28.04,277.89 33.51,261.91 C35.71,255.49 40.23,251.51 44.51,251.54 L44.51,246.76 C33.34,247.26 26.13,258.03 27.77,272.76 C28.98,283.62 34.52,288.94 45.61,289.86 C51.42,290.34 52.21,290.86 52.21,294.17 C52.21,302.46 56.29,303.97 78.61,303.92 C96.02,303.89 100.9,303.08 103.31,299.83 C104.28,298.51 104.29,298.18 104.29,268.72 L104.29,238.94 L78.57,238.82 C64.42,238.75 52.71,238.84 52.53,239.02 Z';
  var EYES = [[144.625, 158.25], [190.625, 158.25]];
  var VB_FULL = '14 56 384 256';
  var VB_HEAD = '96 64 148 148';

  // ---------- 小工具 ----------
  function f2(x) { return Math.round(x * 100) / 100; }
  function p(d, fill, extra) { return '<path d="' + d + '" fill="' + fill + '"' + (extra || '') + '/>'; }
  function stroke(d, color, w, extra, cap) {
    return '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + w + '" stroke-linecap="' + (cap || 'round') + '" stroke-linejoin="round"' + (extra || '') + '/>';
  }
  function circle(x, y, r, fill, extra) { return '<circle cx="' + f2(x) + '" cy="' + f2(y) + '" r="' + r + '" fill="' + fill + '"' + (extra || '') + '/>'; }
  function pair(v, i) { return Array.isArray(v) ? v[i] : v; }
  // 尖细的条纹：宽的一头在 (x1,y1)，尖头在 (x2,y2)，bend 让它带一点弧度
  function wedge(x1, y1, x2, y2, w, bend) {
    var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / len, ny = dx / len, b = bend || 0;
    var mx = (x1 + x2) / 2 + nx * b, my = (y1 + y2) / 2 + ny * b;
    return 'M' + f2(x1 + nx * w / 2) + ',' + f2(y1 + ny * w / 2) +
      ' Q' + f2(mx + nx * w / 4) + ',' + f2(my + ny * w / 4) + ' ' + f2(x2) + ',' + f2(y2) +
      ' Q' + f2(mx - nx * w / 4) + ',' + f2(my - ny * w / 4) + ' ' + f2(x1 - nx * w / 2) + ',' + f2(y1 - ny * w / 2) + ' Z';
  }
  function wedges(list) { return list.map(function (a) { return wedge.apply(null, a); }).join(' '); }
  // 圆润的不规则色块：在椭圆上取几个点、轻轻抖一抖，再用平滑曲线连起来
  function blob(cx, cy, rx, ry, seed, wobble) {
    var k = 7, pts = [], w = wobble == null ? 0.22 : wobble;
    for (var i = 0; i < k; i++) {
      var a = i / k * Math.PI * 2;
      var j = 1 + w * Math.sin(seed * 12.9898 + i * 78.233) * 0.9;
      pts.push([cx + Math.cos(a) * rx * j, cy + Math.sin(a) * ry * j]);
    }
    var d = 'M' + f2(pts[0][0]) + ',' + f2(pts[0][1]);
    for (var m = 0; m < k; m++) {
      var p0 = pts[(m - 1 + k) % k], p1 = pts[m], p2 = pts[(m + 1) % k], p3 = pts[(m + 2) % k];
      d += ' C' + f2(p1[0] + (p2[0] - p0[0]) / 6) + ',' + f2(p1[1] + (p2[1] - p0[1]) / 6) + ' ' +
        f2(p2[0] - (p3[0] - p1[0]) / 6) + ',' + f2(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + f2(p2[0]) + ',' + f2(p2[1]);
    }
    return d + ' Z';
  }

  // ---------- 共用的花纹形状 ----------
  // 胸口：从下巴往下收窄，落在两条前腿之间
  var BIB = 'M140,198 C153,206 181,206 195,198 C195,222 186,244 174,258 C164,270 158,288 157,306 L139,306 C137,282 135,254 136,230 C137,218 138,206 140,198 Z';
  // 下巴以下的整个前身（胸口 + 前腿），渐层猫用
  var FRONT = 'M108,192 C122,200 140,206 160,207 C178,208 194,204 206,196 C208,224 200,250 188,270 C178,288 172,298 170,308 L108,308 Z';
  // 顺着后背轮廓的一道阴影，两头收尖
  var BACKSHADE = 'M224,178 C240,192 262,226 266,262 C268,284 264,300 260,310 L248,310 C244,296 244,280 243,262 C242,244 238,228 233,214 C229,202 226,190 224,178 Z';
  // 两只耳朵（重点色猫的深色耳朵）
  var EARS = 'M104,128 L116,90 L142,118 L134,131 Z M192,126 L212,90 L234,130 L224,140 Z';
  // 缅因的耳尖簇毛
  var TUFTS = wedges([[125, 113, 121, 91, 5.5, -1.5], [205.5, 112, 209.5, 90, 5.5, 1.5]]);
  function forehead(c, w) { w = w || 5.5; return p(wedges([[154, 122, 156, 141, w, 1], [167, 120, 167, 144, w + 0.5, 0], [180, 122, 178, 141, w, -1]]), c); }
  function cheeks(c, w) { w = w || 1; return p(wedges([[110, 170, 133, 172, 5.5 * w, 1], [111, 182, 130, 183, 4.5 * w, 1], [228, 169, 205, 172, 5.5 * w, -1], [226, 181, 208, 183, 4.5 * w, -1]]), c); }
  // 背上的条纹（从后背长进来）和前腿外侧的条纹
  function backStripes(c, k) {
    k = k || 1;
    return p(wedges([[238, 205, 207, 218, 8 * k, -3], [250, 232, 214, 247, 9 * k, -3], [258, 260, 222, 270, 9 * k, -3], [257, 288, 228, 292, 7 * k, -2]]), c);
  }
  function legStripes(c, k) {
    k = k || 1;
    return p(wedges([[122, 226, 141, 233, 6 * k, 2], [127, 254, 144, 259, 6 * k, 2], [129, 280, 145, 283, 5 * k, 2]]), c);
  }
  function mackerel(c, k) { return backStripes(c, k) + legStripes(c, k); }

  // ---------- 每只猫 ----------
  // fur 毛色；edge 轮廓外的细边；k 眼皮高低（1 = 原版，越大越眯，0 = 全睁开）；ps 瞳孔缩放；pdx/pdy 瞳孔偏移；
  // eyeball 眼球颜色（默认原版的浅灰白）；shine 瞳孔里加一点高光
  var SPECS = {
    black: { fur: '#141414', edge: '#FFFFFF', prop: 'cup' },
    orange: {
      // 眯着眼，瞳孔往左下瞟：在看地上那条鱼
      fur: '#E8893C', edge: '#FFFFFF', k: 1.45, pdx: -3.5, pdy: 4, stripe: '#C4611E', tailDash: ['#C4611E', '9 11'], prop: 'fish',
      paint: function (s) { return p(BIB, '#F6D5AC') + forehead(s.stripe) + cheeks(s.stripe) + mackerel(s.stripe); }
    },
    lihua: {
      fur: '#A07D57', edge: '#FFFFFF', k: 1.15, ps: [0.8, 1], stripe: '#3B2B1D', tailDash: ['#3B2B1D', '7 9'],
      paint: function (s) {
        return p(BIB, '#E2D0B5') + forehead(s.stripe, 4.5) + p(wedges([[141, 126, 146, 138, 4, 0], [193, 126, 188, 138, 4, 0]]), s.stripe) +
          cheeks(s.stripe) + mackerel(s.stripe, 0.85) + p(wedges([[232, 196, 214, 203, 6, -2], [254, 248, 230, 256, 6, -2]]), s.stripe);
      }
    },
    mainecoon: {
      // 耳尖簇毛 + 两腮炸开的长毛 + 胸前一大片浅色 + 粗尾巴
      fur: '#8C6948', edge: '#FFFFFF', k: 1.1, stripe: '#4A3422', tailW: 27, tailDash: ['#4A3422', '8 10'], tufts: 1,
      extra: wedges([[124, 166, 103, 175, 11, 3], [124, 178, 104, 189, 11, 3], [126, 190, 110, 202, 10, 3], [212, 166, 234, 174, 11, -3], [214, 178, 234, 188, 11, -3]]),
      paint: function (s) {
        var ruff = 'M134,197 C152,207 182,207 200,197 C202,222 192,246 180,262 C170,276 163,292 161,306 L138,306 C136,282 132,254 132,230 C132,216 133,206 134,197 Z';
        return p(ruff, '#E2D1B8') + forehead(s.stripe) + cheeks(s.stripe) + backStripes(s.stripe);
      }
    },
    golden: {
      // 金色的头和背，下巴以下是奶油色，背上一道深一点的金：这就是“渐层”
      fur: '#E3B76E', edge: '#FFFFFF', k: 1.2, eyeball: '#A9C76B', tail: '#CC9A4E',
      paint: function () { return p(BACKSHADE, '#CC9A4E') + p(FRONT, '#F5E3C1'); }
    },
    silver: {
      fur: '#D3D8DD', edge: '#B7BFC6', k: 1.15, eyeball: '#8FC08A', tail: '#A9B2BA',
      paint: function () { return p(BACKSHADE, '#AAB3BB') + p(FRONT, '#F6F7F8'); }
    },
    blue: { fur: '#7E8B99', edge: '#FFFFFF', k: 0.9, eyeball: '#E9A13B' },
    american: {
      // 银色经典虎斑：额头的 M、脸颊的线、身侧一个卷卷的漩涡、一圈圈的尾巴
      fur: '#C3C8CC', edge: '#FFFFFF', k: 0.8, stripe: '#2F3338', tailDash: ['#2F3338', '8 10'],
      paint: function (s) {
        var c = s.stripe;
        return p(BIB, '#E7EAEC') + forehead(c) + cheeks(c) +
          stroke('M248,263 C247,278 230,282 219,275 C208,267 210,247 225,244 C238,241 243,255 235,262 C228,267 221,261 225,256', c, 7) +
          p(wedges([[236, 210, 206, 222, 7, -3], [222, 194, 204, 202, 6, -2]]), c) + legStripes(c);
      }
    },
    bengal: {
      // 豹纹玫瑰斑：深色外圈 + 浅一点的芯，撒在背上和后腿
      fur: '#DCA052', edge: '#FFFFFF', k: 0.95, ps: [0.75, 1], tailDash: ['#3B2817', '5 9'],
      paint: function () {
        var d = '#3B2817', l = '#B06D28';
        var s = p(BIB, '#F3DDB6') + forehead(d, 4) + cheeks(d, 0.7);
        [[214, 216, 8.5, 1], [238, 234, 8.5, 2], [222, 258, 8.5, 3], [246, 268, 8.5, 4], [214, 288, 8.5, 5], [238, 294, 8.5, 6], [200, 238, 8, 9], [230, 196, 7.5, 7]].forEach(function (q) {
          var r = q[2];
          s += p(blob(q[0], q[1], r, r * 0.82, q[3], 0.25), d) + p(blob(q[0] + 0.5, q[1] + 0.5, r * 0.5, r * 0.4, q[3] + 3, 0.2), l);
        });
        return s;
      }
    },
    siamese: {
      // 深色耳朵 + 一整张深色的脸 + 蓝眼睛
      fur: '#F2E8D9', edge: '#D6C9B5', k: 0.85, eyeball: '#7FB2EE', tail: '#56402F', prop: 'sound',
      paint: function () {
        var pt = '#56402F';
        var mask = 'M126,150 C134,141 152,139 167,139 C182,139 200,141 208,150 C216,160 213,178 203,190 C193,202 180,208 167,209 C154,208 141,202 131,190 C121,178 118,160 126,150 Z';
        return p(EARS, pt) + p(mask, pt);
      }
    },
    ragdoll: {
      // 耳朵和上半张脸是深色，两眼之间一道倒 V 的白；蓝眼睛睁得圆圆的，还泛着光
      fur: '#F7F2EA', edge: '#D5CBBE', k: 0.7, eyeball: '#8DBDF2', ps: [1.1, 1.05], shine: 1, tail: '#8E7462', tailW: 28,
      paint: function () {
        return p('M96,76 H246 V172 C236,184 214,190 200,184 C188,180 178,172 174,160 C171,152 169,146 167,146 C165,146 163,152 160,160 C156,172 146,180 134,184 C120,190 98,184 96,172 Z', '#8E7462');
      }
    },
    cow: {
      // 黑帽子左脸高、右脸低，两眼之间一小道白；两只瞳孔各看各的
      fur: '#FBFAF7', edge: '#CFC9BF', k: 0.45, ps: [0.62, 0.62], pdx: [-4, 5], pdy: [3, -2], tail: '#151515',
      paint: function () {
        var c = '#151515';
        var cap = 'M96,76 H246 V214 C236,206 224,200 212,196 C200,192 188,190 180,185 C175,182 171,178 169,173 C168,171 166,171 165,173 C162,178 158,182 151,185 C140,189 126,187 114,187 C106,187 100,189 96,191 Z';
        return p(cap, c) + p('M196,214 C214,204 241,210 251,232 C259,253 253,277 237,283 C221,289 207,275 205,257 C203,241 188,223 196,214 Z', c) + p(blob(150, 258, 6, 5.5, 4, 0.1), c);
      }
    },
    calico: {
      // 头上左橘右黑，中间一道白；背上一块橘，尾巴根一块黑
      fur: '#FBF9F5', edge: '#D3CCC1', k: 1.2, tail: '#1C1A1A', prop: 'crown',
      paint: function () {
        var o = '#E98A3F', b = '#1C1A1A';
        return p('M96,76 H163 C165,104 165,136 164,160 C163,176 156,184 142,188 C128,191 110,190 96,188 Z', o) +
          p('M171,76 H246 V194 C232,194 214,192 198,188 C182,184 172,176 171,160 C170,136 170,104 171,76 Z', b) +
          p('M198,204 C214,192 244,196 266,214 L266,262 C250,272 230,270 218,258 C206,246 190,216 198,204 Z', o) +
          p('M216,310 C212,292 220,276 236,272 C248,268 260,272 266,280 L266,312 Z', b);
      }
    },
    tortie: {
      // 脸从鼻梁一分为二，右半边的橘一路连到背上；身上再散几块大斑
      fur: '#2A1E1A', edge: '#FFFFFF', k: [1.85, 1], tailDash: ['#C2652E', '10 12'],
      paint: function () {
        var a = '#C2652E', b = '#DE9150', d = '#2A1E1A';
        var s = p('M167,76 C171,106 162,128 168,150 C174,172 166,192 172,210 C184,226 204,236 224,238 C240,240 254,232 266,222 L266,76 Z', a);
        s += p(blob(204, 130, 6, 5, 1, 0.3), d) + p(blob(246, 214, 7, 5, 2, 0.3), d) + p(blob(132, 128, 6, 4.5, 3, 0.3), b);
        s += p(blob(148, 240, 13, 10, 1, 0.3), b) + p(blob(128, 278, 9, 13, 4, 0.25), a) + p(blob(226, 280, 15, 11, 3, 0.3), b) + p(blob(186, 292, 10, 7, 5, 0.3), a);
        return s;
      }
    },
    sphynx: {
      // 大耳朵、额头皱纹、细尾巴，怕冷所以围着围巾
      fur: '#E6C0AA', edge: '#C99E88', k: 0.9, tail: '#E6C0AA', tailW: 14, prop: 'scarf',
      extra: 'M114,142 C110,120 105,94 107,82 C108,76 112,76 116,79 C130,92 143,108 154,124 Z M180,124 C191,108 204,94 218,79 C222,76 226,76 227,82 C229,94 226,120 219,142 Z',
      paint: function () {
        var w = '#C08A75';
        return p('M119,128 C116,112 112,98 113,89 C122,99 132,109 142,121 Z M192,121 C202,109 212,99 221,89 C222,98 218,112 215,128 Z', '#E2A797') +
          stroke('M149,129 Q167,123 185,129', w, 2.4) + stroke('M152,136 Q167,131 182,136', w, 2.2) + stroke('M156,143 Q167,139 178,143', w, 2);
      }
    },
    exotic: {
      // 小耳朵、扁脸；眼皮半垂、瞳孔斜到一边，嘴角往下撇：嫌弃。（表情包本包，所以只有它画了鼻子和嘴）
      fur: '#DDBF95', edge: '#C4A57A', k: 1.25, pdx: 6, pdy: 3, tail: '#DDBF95', tailW: 26, smallEars: 1,
      extra: 'M116,134 L120,108 Q121,103 125,106 L148,124 Z M186,124 L207,106 Q211,103 212,108 L218,134 Z',
      paint: function () {
        return p(BIB, '#EFDFC6') + p('M162.5,181 C162.5,179 171.5,179 171.5,181 C171.5,183 168.5,186 167,186 C165.5,186 162.5,183 162.5,181 Z', '#B07A62') +
          stroke('M167,186 L167,190 M160,195 Q163.5,190 167,190 Q170.5,190 174,195', '#8E6A50', 2.2);
      }
    },
    schrodinger: { fur: '#9AA0A6', edge: '#FFFFFF', k: [1, 1.85], prop: 'box' }
  };

  // ---------- 眼睛 ----------
  // 眼球和瞳孔放进一个遮罩里，遮罩里的黑色椭圆就是眼皮：被它盖住的部分不画，露出脸本来的颜色
  function eyes(sp, u) {
    var s = '';
    EYES.forEach(function (e, i) {
      var cx = e[0], cy = e[1];
      var k = pair(sp.k == null ? 1 : sp.k, i);
      var ps = sp.ps || [1, 1];
      var dx = pair(sp.pdx || 0, i), dy = pair(sp.pdy || 0, i);
      var ry = 8.5625 * k, top = cy - 18.5;
      var mid = u + '-m' + i;
      s += '<mask id="' + mid + '" maskUnits="userSpaceOnUse" x="' + (cx - 24) + '" y="' + (cy - 24) + '" width="48" height="48">' +
        '<rect x="' + (cx - 24) + '" y="' + (cy - 24) + '" width="48" height="48" fill="#fff"/>' +
        (k > 0 ? '<ellipse class="ca-lid" cx="' + f2(cx - 0.625) + '" cy="' + f2(top + ry) + '" rx="21.6" ry="' + f2(ry) + '" fill="#000"/>' : '') +
        '</mask>';
      var px = cx - 0.06 + dx, py = cy - 0.375 + dy;
      // 眼球默认是原版的浅灰白；蓝眼睛、铜色眼睛、绿眼睛的品种直接给眼球上色
      s += '<g mask="url(#' + mid + ')">' + circle(cx, cy, 16.5, sp.eyeball || EYE_WHITE) +
        '<ellipse cx="' + f2(px) + '" cy="' + f2(py) + '" rx="' + f2(5.94 * ps[0]) + '" ry="' + f2(8.25 * ps[1]) + '" fill="#121212"/>' +
        (sp.shine ? circle(px + 2.2 * ps[0], py + 3.2, 2.1, '#FFFFFF') : '') + '</g>';
    });
    return s;
  }

  // ---------- 小道具 ----------
  function props(sp, full) {
    var s = '';
    switch (sp.prop) {
      case 'cup':
        if (full) s += p(CUP, INK);
        break;
      case 'fish':
        if (full) s += '<g transform="translate(64 290)">' + p('M-30,0 Q-10,-18 18,0 Q-10,18 -30,0 Z', '#6FA8D6') + p('M16,0 L34,-12 L32,12 Z', '#6FA8D6') + circle(-19, -2.5, 2.6, INK) + '</g>';
        break;
      case 'crown':
        s += p('M150,125 L147,103 L158,112 L167,96 L176,112 L187,103 L184,125 Z', '#E2B13C') + circle(167, 116, 3, '#E86A6A');
        break;
      case 'scarf':
        s += p('M112,194 C140,212 196,214 228,190 L232,208 C200,234 138,232 110,212 Z', '#4F84D1');
        s += stroke('M126,204 L124,220 M146,210 L145,227 M166,212 L166,229 M186,211 L187,228 M206,205 L208,222', '#F2CC4F', 4);
        if (full) s += p('M188,216 L198,256 L179,259 L174,220 Z', '#4F84D1') + stroke('M178,240 L196,238', '#F2CC4F', 4);
        break;
      case 'sound':
        if (full) s += stroke('M238,160 Q246,170 238,180', INK, 3.2, ' opacity=".5"') + stroke('M248,152 Q262,170 248,188', INK, 3.2, ' opacity=".35"');
        break;
      case 'box':
        if (full) {
          // 纸箱 + 两片掀开的盖子
          s += p('M101,212 L64,190 L75,175 L113,206 Z', '#BE8E54') + p('M269,212 L306,190 L295,175 L257,206 Z', '#BE8E54');
          s += p('M104,216 H266 V308 H104 Z', '#C8975C') + p('M100,208 H270 V226 H100 Z', '#A97A43') + p('M176,226 H196 V308 H176 Z', '#E6D2A6', ' opacity=".9"');
          s += p('M126,210 C126,201 150,201 150,210 Z', sp.fur) + p('M186,210 C186,201 210,201 210,210 Z', sp.fur);
          s += '<path d="M268,124 Q268,104 286,104 Q304,104 304,120 Q304,132 292,136 Q286,139 286,148" fill="none" stroke="' + INK + '" stroke-width="7" stroke-linecap="round"/>' + circle(286, 162, 4.5, INK);
        }
        break;
    }
    return s;
  }

  function cat(sp, u, full) {
    var tailW = sp.tailW || 21;
    var tailColor = sp.tail || sp.fur;
    var s = '<defs><clipPath id="' + u + '-s"><path d="' + BODY + '"/>' + (sp.extra ? '<path d="' + sp.extra + '"/>' : '') + '</clipPath>';
    if (sp.smallEars) s += '<clipPath id="' + u + '-cut"><rect x="0" y="117" width="400" height="300"/></clipPath>';
    s += '</defs>';
    var bodyClip = sp.smallEars ? ' clip-path="url(#' + u + '-cut)"' : '';
    var showTail = full && sp.prop !== 'box';

    // 1. 轮廓外的细边：画在最底下，所以只露出外侧一圈（尾巴的细边跟着尾巴一起甩）
    if (showTail) s += '<g class="ca-tail">' + stroke(TAIL, sp.edge, tailW + 4) + '</g>';
    s += '<path d="' + BODY + '" fill="' + sp.edge + '" stroke="' + sp.edge + '" stroke-width="4" stroke-linejoin="round"' + bodyClip + '/>';
    if (sp.extra) s += '<path d="' + sp.extra + '" fill="' + sp.edge + '" stroke="' + sp.edge + '" stroke-width="6" stroke-linejoin="round"/>';
    if (sp.tufts) s += p(TUFTS, sp.edge, ' stroke="' + sp.edge + '" stroke-width="4" stroke-linejoin="round"');
    // 2. 剪影
    s += '<path d="' + BODY + '" fill="' + sp.fur + '"' + bodyClip + '/>';
    if (sp.extra) s += '<path d="' + sp.extra + '" fill="' + sp.fur + '" stroke="' + sp.fur + '" stroke-width="2" stroke-linejoin="round"/>';
    if (sp.tufts) s += p(TUFTS, sp.stripe || INK);
    // 3. 花纹，裁在剪影里
    if (sp.paint) s += '<g clip-path="url(#' + u + '-s)">' + sp.paint(sp, u) + '</g>';
    // 4. 尾巴压在身子上面（原版也是这样）
    if (showTail) {
      s += '<g class="ca-tail">' + stroke(TAIL, tailColor, tailW);
      if (sp.tailDash) s += stroke(TAIL, sp.tailDash[0], tailW, ' stroke-dasharray="' + sp.tailDash[1] + '"', 'butt');
      s += '</g>';
    }
    // 5. 眼睛
    s += eyes(sp, u);
    // 6. 小道具
    s += props(sp, full);
    return s;
  }

  // 卧底小狗：同一个身子，换成垂耳狗头，戴着猫耳发箍
  function dog(u, full) {
    var fur = '#D7A35E', ear = '#9C6A35', s = '';
    s += '<defs><clipPath id="' + u + '-low"><rect x="0" y="168" width="400" height="200"/></clipPath></defs>';
    var head = 'M167,100 C201,100 223,126 223,158 C223,188 199,208 167,208 C135,208 111,188 111,158 C111,126 133,100 167,100 Z';
    if (full) {
      s += '<g class="ca-tail">' + stroke('M254,294 C282,292 304,272 306,236', '#FFFFFF', 25) + '</g><g class="ca-tail">' + stroke('M254,294 C282,292 304,272 306,236', fur, 21) + '</g>';
      s += stroke('M318,226 L330,218 M322,246 L336,244', INK, 3, ' opacity=".45"');
    }
    s += '<path d="' + BODY + '" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="4" clip-path="url(#' + u + '-low)"/>';
    s += '<path d="' + head + '" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="4"/>';
    s += '<path d="' + BODY + '" fill="' + fur + '" clip-path="url(#' + u + '-low)"/>' + p(head, fur);
    s += p('M140,206 C153,214 181,214 194,206 C192,236 184,268 182,306 L144,306 C142,268 140,236 140,206 Z', '#F2DDBA');
    // 猫耳发箍
    s += p('M130,114 L127,82 L152,104 Z M204,114 L207,82 L182,104 Z', INK) + p('M134,108 L133,92 L145,104 Z M200,108 L201,92 L189,104 Z', '#E8A0A8');
    s += stroke('M122,126 Q167,94 212,126', INK, 6);
    // 垂耳
    s += p('M120,118 C100,120 92,152 100,172 C106,186 123,180 125,164 C127,148 132,124 120,118 Z', ear);
    s += p('M214,118 C234,120 242,152 234,172 C228,186 211,180 209,164 C207,148 202,124 214,118 Z', ear);
    s += p('M143,182 C143,170 191,170 191,182 C191,196 180,203 167,203 C154,203 143,196 143,182 Z', '#F2DDBA');
    s += circle(147, 156, 6.5, INK) + circle(187, 156, 6.5, INK) + circle(149.5, 153.5, 2, '#FFFFFF') + circle(189.5, 153.5, 2, '#FFFFFF');
    s += '<ellipse cx="167" cy="176" rx="8" ry="5.5" fill="' + INK + '"/>';
    s += p('M162,190 h10 v6 a5,5 0 0 1 -10,0 Z', '#E8707F');
    return s;
  }

  function svg(id, opt) {
    opt = opt || {};
    var u = opt.uid || ('ca' + (++n));
    var full = opt.crop !== 'head';
    var vb = full ? VB_FULL : VB_HEAD;
    var body = id === 'dog' ? dog(u, full) : cat(SPECS[id] || SPECS.blue, u, full);
    var size = '';
    if (opt.size) size = full ? ' width="' + opt.size + '" height="' + Math.round(opt.size * 256 / 384) + '"' : ' width="' + opt.size + '" height="' + opt.size + '"';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '"' + size + ' aria-hidden="true">' + body + '</svg>';
  }

  var API = { svg: svg, ids: Object.keys(SPECS).concat(['dog']), aspect: 256 / 384, _specs: SPECS };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.CatArt = API;
})(this);
