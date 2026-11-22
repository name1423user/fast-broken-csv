// node analyze.mjs results.csv — ランタイム×版ごとに 20% トリム平均（上下 20% を捨てる）と、
// 対照（null）を引いた net、その 95% 区間（ブートストラップ 4000 回、固定シード）を出す。round 0 は捨て周。
import { readFileSync } from 'node:fs';

const rows = readFileSync(process.argv[2], 'utf8').trim().split('\n').slice(1).map((l) => l.split(','))
  .map(([round, rt, bot, cpu, st, steal, load]) => ({ round: +round, rt, bot, cpu: +cpu / 1000, st, steal: +steal, load: +load }));
const bad = rows.filter((r) => r.st !== '0' || !(r.cpu > 0));
if (bad.length) console.log('失敗・不一致:', bad);
const ok = rows.filter((r) => r.round > 0 && r.st === '0' && r.cpu > 0);

const trim = (xs, f = 0.2) => {
  const s = [...xs].sort((a, b) => a - b);
  const k = Math.floor(s.length * f);
  const t = s.slice(k, s.length - k);
  return t.reduce((a, b) => a + b, 0) / t.length;
};
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
const resample = (xs) => xs.map(() => xs[Math.floor(rnd() * xs.length)]);
const ci = (f) => {
  const v = Array.from({ length: 4000 }, f).sort((a, b) => a - b);
  return [v[100], v[3899]];
};

const get = (rt, bot) => ok.filter((r) => r.rt === rt && r.bot === bot).map((r) => r.cpu);
const pm = ([lo, hi]) => `±${((hi - lo) / 2).toFixed(1)}`;
console.log('runtime bot   n   gross(ms)        net(ms, -null)');
const net = {};
const rts = [...new Set(ok.map((r) => r.rt))].sort();
const bots = ['null', ...[...new Set(ok.map((r) => r.bot))].filter((b) => b !== 'null')];
for (const rt of rts) {
  const n0 = get(rt, 'null');
  for (const bot of bots) {
    const xs = get(rt, bot);
    const g = trim(xs);
    const nv = g - trim(n0);
    net[rt + bot] = { xs, n0 };
    const nci = bot === 'null' ? '' : `${nv.toFixed(1).padStart(7)} ${pm(ci(() => trim(resample(xs)) - trim(resample(n0))))}`;
    console.log(`${rt.padEnd(7)} ${bot.padEnd(8)} ${String(xs.length).padStart(3)} ${g.toFixed(1).padStart(7)} ${pm(ci(() => trim(resample(xs))))}  ${nci}`);
  }
}
// runsc − runc の net の差（版ごと）
if (rts.length === 2) for (const bot of bots.slice(1)) {
  const a = net['runsc' + bot], b = net['runc' + bot];
  const d = (trim(a.xs) - trim(a.n0)) - (trim(b.xs) - trim(b.n0));
  const c = ci(() => (trim(resample(a.xs)) - trim(resample(a.n0))) - (trim(resample(b.xs)) - trim(resample(b.n0))));
  console.log(`net 差 runsc−runc ${bot.padEnd(8)} ${d.toFixed(1)} ms ${pm(c)}`);
}
const steal = ok.reduce((a, r) => a + r.steal, 0);
console.log(`VM steal 合計 ${steal} ticks / ${ok.length} 回、load1 ${Math.min(...ok.map((r) => r.load))}〜${Math.max(...ok.map((r) => r.load))}`);
// 基準の版（環境変数 BASE、既定 cur）との差: 同じランタイム内の gross の差 = net の差
const base = process.env.BASE ?? 'cur';
if (bots.includes(base)) for (const rt of rts) for (const bot of bots) {
  if (bot === base || bot === 'null') continue;
  const a = get(rt, bot), b = get(rt, base);
  const c = ci(() => trim(resample(a)) - trim(resample(b)));
  console.log(`${rt.padEnd(6)} ${bot.padEnd(8)} − ${base}: ${(trim(a) - trim(b)).toFixed(1).padStart(6)} ms ${pm(c)}`);
}
