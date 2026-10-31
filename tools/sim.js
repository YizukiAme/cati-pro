// 模拟作答：看 16 只猫出现得匀不匀、隐藏款有多稀有、结果和答题人本身对不对得上。
// 用法：node tools/sim.js            （在项目根目录运行）
//       node tools/sim.js <项目目录> [成分表锐度] [薛定谔阈值]
const path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..');
const D = require(path.join(ROOT, 'js/data.js'));
if (process.argv[3]) D.META.mixSharpness = +process.argv[3];
if (process.argv[4]) D.META.schrodingerMax = +process.argv[4];
const E = require(path.join(ROOT, 'js/engine.js')).create(D);
const DK = ['A','B','C','D'];

// structural balance: mean effect per question per dim
const bal = {A:0,B:0,C:0,D:0}, cnt={A:0,B:0,C:0,D:0};
for (const q of D.QUESTIONS) { if (q.type==='egg') continue;
  for (const k of DK) { const vals=q.options.map(o=>o.e[k]||0); if(vals.some(v=>v)){ bal[k]+=vals.reduce((a,b)=>a+b,0)/vals.length; cnt[k]++; } } }
console.log('maxAbs', E.maxAbs);
console.log('每个维度所有选项的平均推力之和（0 = 两边平衡）:', Object.fromEntries(DK.map(k=>[k, +bal[k].toFixed(3)])), 'questions per dim', cnt);

let seed = 12345; function rnd(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
function gauss(){ return Math.sqrt(-2*Math.log(rnd()+1e-12))*Math.cos(2*Math.PI*rnd()); }
function pickW(ws){ const t=ws.reduce((a,b)=>a+b,0); let r=rnd()*t; for(let i=0;i<ws.length;i++){ r-=ws[i]; if(r<=0) return i;} return ws.length-1; }

function answerAs(t, beta, pTwo, pDog){
  const ans = {};
  for (const q of D.QUESTIONS){
    const util = q.options.map(o => DK.reduce((s,k,i)=>s+(o.e[k]||0)*t[i],0));
    const w = util.map(u => Math.exp(beta*u));
    if (q.type==='egg'){ ans[q.id] = {sel:[ rnd()<pDog ? 3 : Math.floor(rnd()*3) ]}; continue; }
    if (q.type==='fish'){ const f=[0,0,0,0]; for(let j=0;j<3;j++) f[pickW(w)]++; ans[q.id]={fish:f}; continue; }
    const first = pickW(w);
    if (q.type==='multi' && rnd()<pTwo){ const w2=w.slice(); w2[first]=0; ans[q.id]={sel:[first,pickW(w2)]}; }
    else ans[q.id]={sel:[first]};
  }
  return ans;
}

function run(label, N, latent, beta, pTwo=0.4, pDog=0.03){
  const cats={}, hidden={}, mains=[]; let agreeLatent=0;
  for (let n=0;n<N;n++){
    const t = latent();
    const r = E.result(answerAs(t,beta,pTwo,pDog));
    cats[r.catId]=(cats[r.catId]||0)+1;
    if (r.hiddenId) hidden[r.hiddenId]=(hidden[r.hiddenId]||0)+1;
    mains.push(r.mix[0].p);
    const sg=E.signs(r.s); if (sg.every((x,i)=>x===(t[i]>=0?1:-1))) agreeLatent++;
  }
  const shares = D.CATS.map(c=>[c.name, (cats[c.id]||0)/N]);
  shares.sort((a,b)=>b[1]-a[1]);
  mains.sort((a,b)=>a-b);
  console.log(`\n== ${label} (N=${N}, beta=${beta})`);
  console.log(shares.map(([n,p])=>`${n} ${(p*100).toFixed(1)}%`).join(' | '));
  console.log('max', (shares[0][1]*100).toFixed(1)+'%', 'min', (shares[shares.length-1][1]*100).toFixed(1)+'%');
  console.log('hidden', Object.fromEntries(Object.entries(hidden).map(([k,v])=>[k,(v/N*100).toFixed(2)+'%'])));
  console.log('主猫在成分表里的占比: p10 %s  中位数 %s  p90 %s', (mains[Math.floor(N*.1)]*100).toFixed(0), (mains[Math.floor(N*.5)]*100).toFixed(0), (mains[Math.floor(N*.9)]*100).toFixed(0));
  if (beta>0) console.log('四个维度方向全和答题人本身一致的比例:', (agreeLatent/N*100).toFixed(1)+'%');
}
const uni = () => DK.map(()=>rnd()*2-1);
const normal = () => DK.map(()=>Math.max(-1,Math.min(1,gauss()*0.5)));
run('随便乱点', 40000, uni, 0);
run('认真答题，性格均匀分布', 40000, uni, 2.5);
run('认真答题，大多数人性格不极端', 40000, normal, 2.5);
run('答得比较随意，性格不极端', 40000, normal, 1.2);
