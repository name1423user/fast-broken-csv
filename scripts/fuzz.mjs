// 一致テスト（AC-002, AC-003）。キットの生成器で seed ごとに6ケースを作り、固定の境界ケースと合わせて、
// 基準（キットの oracle.js = csv-reader 1.0.0）と solve.js の答えを JSON 値として比べる。
//
//   node scripts/fuzz.mjs [solve.js のパス] [--seeds N]
//
// パスを省くとリポジトリの solve.js。答えは JSON を通した値で比べ、オブジェクトのキー順は問わない（採点と同じ）。
// 不一致が1件でもあれば終了コード 1。

import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const root = new URL('../', import.meta.url);
const gen = new URL('kit-dl/csv-reader-speed-01-run-20261121-kit/program/generator/', root);

const args = process.argv.slice(2);
const seedsAt = args.indexOf('--seeds');
const seedCount = seedsAt >= 0 ? Number(args.splice(seedsAt, 2)[1]) : 50;
if (!Number.isInteger(seedCount) || seedCount < 0) throw new Error('--seeds には 0 以上の整数を渡す');
const entryUrl = args[0] ? pathToFileURL(resolve(args[0])).href : new URL('solve.js', root).href;

const { run: oracle } = await import(new URL('oracle.js', gen).href);
const { generate } = await import(new URL('subject/csv-cases.mjs', gen).href);
const { streamFor } = await import(new URL('rng.ts', gen).href);
const { run: entry } = await import(entryUrl);

/** 採点と同じく JSON を通した値（undefined は null）。 */
const asJson = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

// AC-003 の境界ケース。header の true / false 両方で試す。
const FIXED = [
  '', '﻿', '﻿﻿', '\n', '\n\n\n', '\r\n', '\r\n\r\n', '\r', '\r\r\n', 'a', 'a\n', 'a\r\n', 'a\r', 'a\rb\n',
  'a,b\nc,d', 'a,b\r\nc,d', 'a,b\n1,2\n', 'a\nb\nc\n', 'a,b,c\n1\n1,2,3,4,5\n', ',\n,,\n', '"', '""', '"""', 'a"', 'a,"',
  'a,b\n1,"', '"a""b",c\n', '"a\nb",c\n"d\r\ne",f\n"g\rh",i\n', '"a"x,b\n', '"a"x"y,b\n', '"a" ,b\n', 'a"b,c\n',
  'a,b\n"open,c\nd,e\n', 'a,b\nc,"open', 'a,b\nc,d\n"x', '﻿a,b\n1,2', 'a,b\n\n1,2\n\r\n3,4', 'h1,h2\n', 'h1,h2',
  'a,b\n1,2\rx,3\n', 'x,"y\r', ' a , b \n', '東京,"數據"\nΔέλτα,Москва\n',
].flatMap((text) => [true, false].map((header) => ({ text, header })));

let total = 0;
let mismatches = 0;

function check(id, input) {
  total++;
  const want = asJson(oracle({ ...input }));
  let got;
  try {
    got = asJson(entry({ ...input }));
  } catch (e) {
    got = `throws: ${e?.message ?? e}`;
  }
  if (isDeepStrictEqual(got, want)) return;
  mismatches++;
  if (mismatches <= 10) {
    const g = JSON.stringify(got);
    const w = JSON.stringify(want);
    let i = 0;
    while (i < g.length && g[i] === w[i]) i++;
    console.log(`不一致 ${id} (header=${input.header}, 先頭 ${JSON.stringify(input.text.slice(0, 40))})`);
    console.log(`  基準:    …${w.slice(Math.max(0, i - 60), i + 80)}`);
    console.log(`  solve.js: …${g.slice(Math.max(0, i - 60), i + 80)}`);
  }
}

FIXED.forEach((input, i) => check(`fixed-${i}`, input));

for (let s = 0; s < seedCount; s++) {
  const seed = createHash('sha256').update(`fast-broken-csv/fuzz/${s}`).digest('hex');
  for (let i = 0; i < 6; i++) check(`seed-${s}/g-${i + 1}`, generate(streamFor(seed, 'case', i), i));
}

console.log(`${total} ケース（固定 ${FIXED.length}、生成 ${seedCount * 6}）、不一致 ${mismatches} 件`);
process.exit(mismatches === 0 ? 0 : 1);
