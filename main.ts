// 採点用の入口。`node /bot/main.ts`（Node 22）で動き、/input/cases.json の各ケースを solve.js の runJson() で解いて
// /output/answers.json に答えの配列（ケース順）を書く。手元では MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR で場所を変えられる。

import { closeSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// 基準と同じ条件で測るため、solve.js を読み込む前にインクリメンタルマーキングを切る。
setFlagsFromString('--no-incremental-marking');
// --single-threaded-gc（や並行マーキングを切るフラグ）は実行中に設定すると、GC の途中で V8 が
// "Check failed: concurrent_marking_handle_ ..." で落ちる（練習セットの3倍の入力で再現）ので使わない。

const { runJson } = (await import(new URL('./solve.js', import.meta.url).href)) as { runJson: (input: unknown) => string };

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Buffer で読んでから toString する方が、'utf8' 指定の読み込みより約 8ms 速い（Node 22、Docker で計測）。
const cases = JSON.parse(readFileSync(join(inputDir, 'cases.json')).toString()) as { id: string; input: unknown }[];
// 答えを値にせず JSON の文字列で受け取り（runJson は JSON.stringify(run(input)) とバイト単位で同じ）、ケースごとにすぐ書く。
// 値の保持と全体の stringify、12MB の文字列をつなぐコピーを省く。fd を渡した writeFileSync は書き切るまで繰り返す。
const fd = openSync(join(outputDir, 'answers.json'), 'w');
writeFileSync(fd, '[');
cases.forEach((c, k) => writeFileSync(fd, (k ? ',' : '') + runJson(c.input)));
writeFileSync(fd, ']');
closeSync(fd);
