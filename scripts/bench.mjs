// 速度測定（AC-005）。2つのボット（main.ts と solve.js のあるフォルダ）を、採点と同じ Node 22 のイメージ・1 CPU・1024MB の
// Docker コンテナで練習セットに対して交互に実行し、CPU 時間（コンテナの cgroup の usage_usec = user+sys、node の起動を含む）の
// 中央値と比（B / A）を出す。
//
//   node scripts/bench.mjs [A のフォルダ] [B のフォルダ] [--runs N]
//
// 省くと A = キットの基準（baselines/csv-reader）、B = このリポジトリ。各 N 回（既定 10）。Docker Desktop が動いていること。

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// grade-local が使う採点用イメージ（Node 22.23.4）。
const IMAGE = 'node@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d';
const root = fileURLToPath(new URL('../', import.meta.url));
const kit = join(root, 'kit-dl/csv-reader-speed-01-run-20261121-kit');

const args = process.argv.slice(2);
const runsAt = args.indexOf('--runs');
const runs = runsAt >= 0 ? Number(args.splice(runsAt, 2)[1]) : 10;
if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs には 1 以上の整数を渡す');
const bots = { A: resolve(args[0] ?? join(kit, 'baselines/csv-reader')), B: resolve(args[1] ?? root) };
const input = join(kit, 'practice/input');

/** 1回実行し、コンテナ全体の CPU 時間（ミリ秒）を返す。 */
function once(bot) {
  const out = mkdtempSync(join(tmpdir(), 'bench-'));
  try {
    const r = spawnSync('docker', [
      'run', '--rm', '--network', 'none', '--cpus', '1', '--memory', '1024m',
      '-v', `${bot}:/bot:ro`, '-v', `${input}:/input:ro`, '-v', `${out}:/output`,
      IMAGE, 'sh', '-c', 'node /bot/main.ts && cat /sys/fs/cgroup/cpu.stat',
    ], { encoding: 'utf8' });
    const m = /^usage_usec (\d+)$/m.exec(r.stdout);
    if (r.status !== 0 || !m) throw new Error(`${bot} の実行に失敗: ${r.stderr || r.stdout}`);
    return Number(m[1]) / 1000;
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};

const times = { A: [], B: [] };
for (let i = 0; i < runs; i++) {
  for (const k of ['A', 'B']) times[k].push(once(bots[k]));
  console.log(`${i + 1}/${runs}  A ${times.A[i].toFixed(0)} ms  B ${times.B[i].toFixed(0)} ms`);
}
const a = median(times.A);
const b = median(times.B);
console.log(`A ${bots.A}\n  中央値 ${a.toFixed(1)} ms`);
console.log(`B ${bots.B}\n  中央値 ${b.toFixed(1)} ms`);
console.log(`比 B/A = ${(b / a).toFixed(3)}`);
