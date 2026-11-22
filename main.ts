// 採点用の入口。`node /bot/main.ts`（Node 22）で動き、/input/cases.json の各ケースを solve.js の run() で解いて
// /output/answers.json に答えの配列（ケース順）を書く。手元では MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR で場所を変えられる。

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// 基準と同じ条件で測るため、solve.js を読み込む前にインクリメンタルマーキングを切る。
setFlagsFromString('--no-incremental-marking');

const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as { run: (input: unknown) => unknown };

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(inputDir, 'cases.json'), 'utf8')) as { id: string; input: unknown }[];
const answers: unknown[] = [];
for (const c of cases) answers.push(run(c.input));
writeFileSync(join(outputDir, 'answers.json'), JSON.stringify(answers));
