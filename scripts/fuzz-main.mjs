// main.ts（バイト列変換器）を端から端まで試す一致テスト。cases.json をいろいろな書き方で作り、main.ts を
// MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR で実行して、answers.json を基準（キットの oracle.js）と JSON 値で比べる。
// JSON.stringify そのままの書き方では、solve.js へのフォールバックが起きないことも確かめる（速さの前提）。
//
//   node scripts/fuzz-main.mjs [--seeds N]
//
// 不一致か想定外のフォールバックが1件でもあれば終了コード 1。

import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { FIXED } from './fixed-cases.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const kit = join(root, 'kit-dl/csv-reader-speed-01-run-20261121-kit');
const gen = new URL(`file://${kit}/program/generator/`);

const args = process.argv.slice(2);
const seedsAt = args.indexOf('--seeds');
const seedCount = seedsAt >= 0 ? Number(args.splice(seedsAt, 2)[1]) : 20;
if (!Number.isInteger(seedCount) || seedCount < 1) throw new Error('--seeds には 1 以上の整数を渡す');

const { run: oracle } = await import(new URL('oracle.js', gen).href);
const { generate } = await import(new URL('subject/csv-cases.mjs', gen).href);
const { streamFor } = await import(new URL('rng.ts', gen).href);

const asJson = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
const tmp = mkdtempSync(join(tmpdir(), 'fuzz-main-'));
const inDir = join(tmp, 'in');
const outDir = join(tmp, 'out');
mkdirSync(inDir);
mkdirSync(outDir);

let runs = 0;
let failures = 0;
const fail = (msg) => { failures++; if (failures <= 20) console.log(msg); };

/** cases.json（文字列か Buffer）で main.ts を動かし、各ケースを基準と比べる。want は基準の答えの配列。 */
function check(name, body, want, { noFallback }) {
  runs++;
  writeFileSync(join(inDir, 'cases.json'), body);
  rmSync(join(outDir, 'answers.json'), { force: true });
  const r = spawnSync(process.execPath, [join(root, "main.ts")], {
    env: { ...process.env, MAKEFUN_INPUT_DIR: inDir, MAKEFUN_OUTPUT_DIR: outDir, FBCSV_TRACE: '1' },
    encoding: 'utf8',
    maxBuffer: 1 << 26,
  });
  if (r.status !== 0) return fail(`${name}: main.ts が失敗 ${r.stderr.slice(0, 400)}`);
  if (noFallback && r.stderr.includes('fallback')) fail(`${name}: 想定外のフォールバック ${r.stderr.trim().split('\n').slice(0, 3).join(' / ')}`);
  let got;
  try {
    got = JSON.parse(readFileSync(join(outDir, 'answers.json'), 'utf8'));
  } catch (e) {
    return fail(`${name}: answers.json が JSON でない ${e.message}`);
  }
  if (got.length !== want.length) return fail(`${name}: 答えの数 ${got.length}（期待 ${want.length}）`);
  want.forEach((w, i) => {
    if (isDeepStrictEqual(got[i], w)) return;
    const g = JSON.stringify(got[i]);
    const s = JSON.stringify(w);
    let k = 0;
    while (k < g.length && g[k] === s[k]) k++;
    fail(`${name} ケース ${i}: 不一致\n  基準:    …${s.slice(Math.max(0, k - 60), k + 80)}\n  main.ts: …${g.slice(Math.max(0, k - 60), k + 80)}`);
  });
}

const toCases = (inputs) => inputs.map((input, i) => ({ id: `c-${i + 1}`, input }));
const answers = (cases) => cases.map((c) => asJson(oracle({ ...c.input })));
const genSet = (s) => {
  const seed = createHash('sha256').update(`fast-broken-csv/fuzz-main/${s}`).digest('hex');
  return Array.from({ length: 6 }, (_, i) => generate(streamFor(seed, 'case', i), i));
};

// 書き方の変種
const canon = (cases) => JSON.stringify(cases);
const pretty = (cases) => JSON.stringify(cases, null, 2);
const reorder = (cases) => JSON.stringify(cases.map((c) => ({ input: { header: c.input.header, text: c.input.text }, id: c.id })));
const extraKeys = (cases) => JSON.stringify(cases.map((c) => ({ id: c.id, meta: { a: [1, -2.5e3, { b: null }], t: true }, input: { ...c.input, note: 'x,"y"' } })));
const asciiEsc = (cases) => JSON.stringify(cases).replace(/[\u007f-￿]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
const slashEsc = (cases) => JSON.stringify(cases).replaceAll('/', '\\/');

const fixed = toCases(FIXED);
const fixedWant = answers(fixed);
const g0 = toCases(genSet(0));
const g0Want = answers(g0);
const mixed = [...fixed, ...g0];
const mixedWant = [...fixedWant, ...g0Want];

check('fixed/canon', canon(fixed), fixedWant, { noFallback: true });
check('mixed/reorder', reorder(mixed), mixedWant, { noFallback: true });
check('mixed/extraKeys', extraKeys(mixed), mixedWant, { noFallback: true });
check('mixed/pretty', pretty(mixed), mixedWant, { noFallback: false });
check('mixed/asciiEsc', asciiEsc(mixed), mixedWant, { noFallback: false });
check('mixed/slashEsc', slashEsc(mixed), mixedWant, { noFallback: false });
check('empty', '[]', [], { noFallback: true });

// 型や形が違うケース（solve.js に落ちる）。基準が例外を出すものは比べられないので外す。
const odd = toCases([
  { text: 123, header: true }, { text: 'a,b\n1', header: 1 }, { text: 'a,b\n1' }, { text: 'a,b\n1', header: null },
  { text: 'a,b\n1', header: true, text2: 'x' }, { text: '﻿a\n😀,\ud800', header: false },
]).filter((c) => { try { oracle({ ...c.input }); return true; } catch { return false; } });
check('odd/canon', canon(odd), answers(odd), { noFallback: false });
const dupBody = '[{"id":"d","input":{"text":"a,b\\n1","header":true,"header":false}},{"id":"e","input":{"text":"x","text":"y,z"}}]';
check('odd/duplicateKeys', dupBody, answers(JSON.parse(dupBody)), { noFallback: false });

// 不正な UTF-8（ファイル全体を元のやり方で解く。期待値も同じ置き換えのあとの値）
const badUtf8 = Buffer.concat([Buffer.from('[{"id":"u","input":{"text":"a,b\\n'), Buffer.from([0xff, 0xc3]), Buffer.from('x,\\"y\\r\\n","header":true}}]')]);
check('badUtf8', badUtf8, answers(JSON.parse(badUtf8.toString('utf8'))), { noFallback: false });

// 負荷: 出力の伸長（幅 1000 に 1 文字の行）、stray CR の多発、数 MB のフィールド、long_row の多発、閉じない引用符
const stress = toCases([
  { text: Array.from({ length: 1000 }, (_, i) => `h${i}`).join(',') + '\n' + 'x\n'.repeat(20000), header: true },
  { text: 'a\rb\r,c\r\n'.repeat(50000), header: false },
  { text: '"' + 'x"",\r\n'.repeat(500000) + '",y\n1,2\n', header: true },
  { text: 'a,b\n' + '1,2,3,"4\r\n",\r5\n'.repeat(30000), header: true },
  { text: 'a,b\n' + 'c,"d\n'.repeat(3000), header: false },
  { text: '\r'.repeat(100000), header: true },
]);
check('stress/canon', canon(stress), answers(stress), { noFallback: true });

// 練習セットの3倍（以前 V8 が落ちた規模）
const practice = JSON.parse(readFileSync(join(kit, 'practice/input/cases.json'), 'utf8'));
const triple = [...practice, ...practice, ...practice];
check('practice x3', canon(triple), answers(triple), { noFallback: true });

for (let s = 1; s <= seedCount; s++) {
  const cases = toCases(genSet(s));
  check(`seed-${s}/canon`, canon(cases), answers(cases), { noFallback: true });
}

rmSync(tmp, { recursive: true, force: true });
console.log(`main.ts を ${runs} 回実行、不一致・想定外 ${failures} 件`);
process.exit(failures === 0 ? 0 : 1);
