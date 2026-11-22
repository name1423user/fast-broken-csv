import { closeSync, fstatSync, openSync, readSync, writeFileSync } from 'node:fs';
import { setFlagsFromString } from 'node:v8';
setFlagsFromString('--no-incremental-marking');
setFlagsFromString('--no-concurrent-recompilation');
setFlagsFromString('--no-turbo-loop-peeling');
const fd0 = openSync('/input/cases.json', 'r');
const len = fstatSync(fd0).size;
const src = Buffer.allocUnsafe(len + 4096);
for (let got = 0; got < len; ) { const r = readSync(fd0, src, got, len - got, got); if (r <= 0) throw new Error('short'); got += r; }
closeSync(fd0);
// 読み＋書き: 本物と同じ大きさの出力バッファに本物と同じ量（12,073,175 B）を写して書く
const ANS = 12073175;
const out = Buffer.allocUnsafe(len * 4 + (1 << 20));
for (let o = 0; o < ANS; o += len) src.copy(out, o, 0, Math.min(len, ANS - o));
writeFileSync('/output/answers.json', out.subarray(0, ANS));
