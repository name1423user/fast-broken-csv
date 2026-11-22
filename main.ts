// 採点用の入口（`node /bot/main.ts`、Node 22）。本体は transducer.js。
// .ts は読み込むたびに Node が型除去にかけ、本体ほどの大きさだと1回 約 50ms かかる（Docker で計測）ので、ここは1行にして本体を .js に置く。
import './transducer.js';
