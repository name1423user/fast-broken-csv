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
