// main.ts から読み込まれる本体。/input/cases.json を読んで /output/answers.json に答えの配列（ケース順）を書く。
// 手元では MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR で場所を変えられる。
//
// バイト列変換器: cases.json のバイト列を JSON.parse せずに読み、各ケースの text（JSON 文字列のままのエスケープ形）を
// CSV として走査しながら、答えの JSON を直接バイトで書く。フィールドの中身は JSON.stringify の出力と同じエスケープ形なので、
// 入力のバイトをそのまま写せる（引用符つきフィールドの "" と改行だけ書き換える）。文字列を作らないので GC もほぼ動かない。
// 挙動は solve.js（正しさのアンカー）と同じ。根拠は docs/BASELINE_NOTES.md（B-xx）。
// 想定外の形（JSON.stringify が出さないエスケープ、キーの重複・欠け、text が文字列でない等）はそのケースだけ
// JSON.parse → solve.js の runJson に落とす。不正な UTF-8 や読めない構造ならファイル全体を元のやり方で解く。

import { closeSync, fstatSync, openSync, readSync, writeFileSync, writeSync } from 'node:fs';
import { isUtf8 } from 'node:buffer';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// 基準と同じく、インクリメンタルマーキングを切る（--single-threaded-gc などは実行中に設定すると V8 が落ちるので使わない）。
setFlagsFromString('--no-incremental-marking');
// 最適化コンパイルを別スレッドに出さず、その場で行う。1 CPU では並行コンパイルの方が CPU 時間が多い（Docker で変換 約 74ms → 約 63ms）。
setFlagsFromString('--no-concurrent-recompilation');
// TurboFan のループ展開（peeling）を切る。コンパイルが軽くなり、Docker の bench で net 約 79ms → 約 67ms（他の turbo-* は誤差）。
setFlagsFromString('--no-turbo-loop-peeling');
// Sparkplug（ベースライン JIT）を切る。gVisor（colima runsc、練習セット 1000 周）で上の 1MB ごとの書き出しと合わせて
// net 78.4ms → 72.0ms（−6.4 ±1.0ms）、runc でも単独で約 −3.4ms。
setFlagsFromString('--no-sparkplug');

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const BS = 92; // '\'
const DQ = 34; // '"'
const COMMA = 44;
const LB = 91; // '['
const RB = 93; // ']'
const LC = 123; // '{'
const RC = 125; // '}'
const COLON = 58;
const N = 110; // 'n'（\n）
const R = 114; // 'r'（\r）
const U = 117; // 'u'（\uXXXX）
const BAD = new Error('cases.json の形が想定外'); // ファイル全体を元のやり方で解く
const ODD = new Error('JSON.stringify が出さないエスケープ'); // そのケースだけ solve.js で解く

// JIT の準備走行に使う合成テキスト。読みのすべての分岐（引用符つき・"" ・中の CR/LF/CRLF・quote_junk・閉じない引用符・
// stray_cr・エスケープ・空行・捨てるレコード・short_row・long_row）を通す。最適化されたコードが未通過の分岐に入ると
// 「型情報の不足」で最適化が外れ、インタプリタからやり直しになる（練習セットで 18 回、約 60ms）のを防ぐ。答えは捨てる。
const WARM = Buffer.from(JSON.stringify(
  '\ufeffh1,h2,h3\r\na,b,c\n"q""x\r\ny\rz\nw","\\\t\b\f\u0001é",p\nx\\y\t\u0002,"j"junk,k\n\r\n\nshort\n1,2,3,4,5\n' +
  'a\rb,c,d\n"a"\rb,c,d\na"b,"",d\n\r\r\n"x"\r\n"y",z,\n10,11,12\ne,"never closed\r,z',
).slice(1, -1));

// 末尾に '"' を 8 個足して読む。壊れた JSON でも走査が必ず止まる（その場合は後の構造チェックで BAD になる）。
// その後ろに準備走行の text（JSON 文字列の中身の形）と、もう一度 '"' 8 個を置く。
const fd0 = openSync(join(inputDir, 'cases.json'), 'r');
const len = fstatSync(fd0).size;
const src = Buffer.allocUnsafe(len + 16 + WARM.length);
for (let got = 0; got < len; ) {
  const r = readSync(fd0, src, got, len - got, got);
  if (r <= 0) throw new Error('cases.json を読み切れない');
  got += r;
}
closeSync(fd0);
src.fill(DQ, len, len + 8);
WARM.copy(src, len + 8);
src.fill(DQ, len + 8 + WARM.length);

// 出力。不変条件: レコードの頭で out の残り >= 4 × (入力の残り) + 512。1レコードの出力は入力の 3 倍 + 定数に収まる
// （例外は short_row の埋めと errors の写しで、その前に growOut で広げる）。型付き配列は範囲外の書き込みを黙って捨てるので必須。
let out = Buffer.allocUnsafe(len * 4 + (1 << 20));
// 4 バイト単位の読み書き用（区切りの無い 4 バイトをまとめて写す）。out を広げたら作り直す。
const sv = new DataView(src.buffer, src.byteOffset, src.length);
let ov = new DataView(out.buffer, out.byteOffset, out.length);
let o = 0;
let err = Buffer.allocUnsafe(1 << 16); // 1ケースぶんの errors の中身
let e = 0;
let nErr = 0;

// 1ケースの読みの状態。doCase の最初に全部初期化し、ケース間で持ち越さない。
let p = 0; // text 内の位置（src のバイト位置、文字の頭）
let line = 1;
let recLine = 1;
let rowCount = 0;
let width = -1;
let gap = 0; // '{"columns":' の直後。header が分かるまで 13 バイト空けておく
let r0s = -1; // 先頭レコード（header が true なら columns になる）の out での範囲
let r0e = -1;
let nErrFirst = 0; // 先頭レコードの終わりまでに出たエラーの数（header が true なら row は null）
let rowPos = new Int32Array(1024); // 各エラーの row の値の err での位置

function growOut(need) {
  if (out.length - o >= need) return;
  const b = Buffer.allocUnsafe(Math.max(out.length * 2, o + need));
  out.copy(b, 0, 0, o);
  out = b;
  ov = new DataView(b.buffer, b.byteOffset, b.length);
}
function growErr(need) {
  if (err.length - e >= need) return;
  const b = Buffer.allocUnsafe(Math.max(err.length * 2, e + need));
  err.copy(b, 0, 0, e);
  err = b;
}

const E_STRAY = Buffer.from('{"code":"stray_cr","line":');
const E_JUNK = Buffer.from('{"code":"quote_junk","line":');
const E_UNTERM = Buffer.from('{"code":"unterminated_quote","line":');
const E_SHORT = Buffer.from('{"code":"short_row","line":');
const E_LONG = Buffer.from('{"code":"long_row","line":');
const S_ROW = Buffer.from(',"row":');
const S_NULL = Buffer.from('null');
const S_FIELDS = Buffer.from(',"fields":');
const S_EXTRA = Buffer.from(',"extra":[');
const S_HEAD_COLS = Buffer.from('{"columns":');
const S_NULL_ROWS = Buffer.from('null,"rows":[');
const S_ROWS = Buffer.from(',"rows":[');
const S_EMPTY_ROWS = Buffer.from('[],"rows":[');
const S_ERRORS = Buffer.from('],"errors":[');
const K_INPUT = Buffer.from('input');
const K_TEXT = Buffer.from('text');
const K_HEADER = Buffer.from('header');

function putInt(b, w, v) {
  if (v >= 10) w = putInt(b, w, (v / 10) | 0);
  b[w] = 48 + (v % 10);
  return w + 1;
}

// エラーの頭（code・line・row）まで書く。row は header が無いものとして、レコードの頭での rows の数を書き、
// 位置を rowPos に控える（header が true と分かったら finishCase で直す）。
function errStart(code, extra) {
  growErr(128 + extra);
  if (nErr > 0) err[e++] = COMMA;
  if (nErr === rowPos.length) { const b = new Int32Array(nErr * 2); b.set(rowPos); rowPos = b; }
  err.set(code, e);
  e += code.length;
  e = putInt(err, e, recLine);
  err.set(S_ROW, e);
  e += S_ROW.length;
  rowPos[nErr++] = e;
  e = putInt(err, e, rowCount);
}
function errSimple(code) {
  errStart(code, 0);
  err[e++] = RC;
}

// \uXXXX が JSON.stringify の出す形か（小文字の \u00XX で、\b \t \n \f \r に当たらない制御文字）。
function okU(q) {
  if (src[q + 2] !== 48 || src[q + 3] !== 48) return false;
  const h = src[q + 4];
  const l = src[q + 5];
  let v;
  if (l >= 48 && l <= 57) v = l - 48;
  else if (l >= 97 && l <= 102) v = l - 87;
  else return false;
  if (h === 49) return true;
  if (h !== 48) return false;
  return v !== 8 && v !== 9 && v !== 10 && v !== 12 && v !== 13;
}

// 引用なしの読み（B-11・B-18・B-22）。カンマ・LF・CRLF・text の終わりの手前まで写す。単独 CR は捨てて stray_cr。
function readPlain() {
  const s = src;
  const d = out;
  let q = p;
  let w = o;
  for (;;) {
    const c = s[q];
    if (c === COMMA || c === DQ) break;
    if (c !== BS) { d[w++] = c; q++; continue; }
    const x = s[q + 1];
    if (x === N) break;
    if (x === R) {
      if (s[q + 2] === BS && s[q + 3] === N) break;
      errSimple(E_STRAY);
      q += 2;
      continue;
    }
    if (x === DQ || x === BS || x === 116 || x === 98 || x === 102) { d[w++] = BS; d[w++] = x; q += 2; continue; }
    if (x === U && okU(q)) {
      d[w++] = BS; d[w++] = U; d[w++] = s[q + 2]; d[w++] = s[q + 3]; d[w++] = s[q + 4]; d[w++] = s[q + 5];
      q += 6;
      continue;
    }
    throw ODD;
  }
  p = q;
  o = w;
}

// 引用符つき（B-16〜B-25）。p は開き引用符（\"）。閉じたら true。行数は閉じたときだけ確定する。
function readQuoted() {
  const s = src;
  const d = out;
  const q0 = p;
  const w0 = o;
  let q = p + 2;
  let w = o;
  let nl = 0;
  for (;;) {
    // '"' と '\' を含まない 4 バイトはまとめて写す（SWAR: 各バイトとの xor が 0 になるバイトがあるかを見る）
    for (;;) {
      const v = sv.getUint32(q, true);
      const a = v ^ 0x22222222;
      const b = v ^ 0x5c5c5c5c;
      const m = ((((a - 0x01010101) | 0) & ~a) | (((b - 0x01010101) | 0) & ~b)) & 0x80808080;
      ov.setUint32(w, v, true); // 特殊文字より後ろの余分なバイトは、続きの書き込みで上書きされる
      if (m !== 0) {
        const k = (31 - Math.clz32(m & ((0 - m) | 0))) >> 3; // 最初の特殊文字の位置（最下位の印は必ず正しい）
        q += k;
        w += k;
        break;
      }
      q += 4;
      w += 4;
    }
    const c = s[q];
    if (c === DQ) {
      // 閉じない引用符: `"` を文字として、直後から引用なしで読み直す
      errSimple(E_UNTERM);
      o = w0;
      d[o++] = BS;
      d[o++] = DQ;
      p = q0 + 2;
      readPlain();
      return false;
    }
    if (c !== BS) { d[w++] = c; q++; continue; }
    const x = s[q + 1];
    if (x === DQ) {
      if (s[q + 2] === BS && s[q + 3] === DQ) { d[w++] = BS; d[w++] = DQ; q += 4; continue; }
      q += 2;
      break;
    }
    // 引用符の中の LF・CRLF・単独 CR はどれも LF 1つ、行は1つ進む
    if (x === N) { d[w++] = BS; d[w++] = N; nl++; q += 2; continue; }
    if (x === R) { d[w++] = BS; d[w++] = N; nl++; q += s[q + 2] === BS && s[q + 3] === N ? 4 : 2; continue; }
    if (x === BS || x === 116 || x === 98 || x === 102) { d[w++] = BS; d[w++] = x; q += 2; continue; }
    if (x === U && okU(q)) {
      d[w++] = BS; d[w++] = U; d[w++] = s[q + 2]; d[w++] = s[q + 3]; d[w++] = s[q + 4]; d[w++] = s[q + 5];
      q += 6;
      continue;
    }
    throw ODD;
  }
  line += nl;
  p = q;
  o = w;
  const c = s[q];
  if (c === COMMA || c === DQ) return true;
  if (c === BS) {
    const x = s[q + 1];
    if (x === N || (x === R && s[q + 2] === BS && s[q + 3] === N)) return true;
  }
  readPlain(); // 閉じ引用符の後ろはそのまま足す（B-18・B-19）
  if (o > w) errSimple(E_JUNK);
  return true;
}

// 1レコードを読んで書く。text の終わりなら false。
function readRecord() {
  const s = src;
  // 空行（LF / CRLF だけ）を飛ばす（B-08）
  for (;;) {
    if (s[p] !== BS) break;
    const x = s[p + 1];
    if (x === N) { p += 2; line++; }
    else if (x === R && s[p + 2] === BS && s[p + 3] === N) { p += 4; line++; }
    else break;
  }
  if (s[p] === DQ) return false;
  const reserve = ((len - p) << 2) + 512;
  if (out.length - o < reserve) growOut(reserve);
  const d = out;
  recLine = line;
  const recStart = o;
  if (rowCount > 0) d[o++] = COMMA;
  d[o++] = LB;
  let k = 0;
  let xs = -1; // 幅を超えたフィールド（long_row の extra）の書き始め
  let qc = false;
  let empty = false;
  // フィールドごとの関数呼び出しが重いので、引用なしの普通の文字はここで写す。エスケープと引用符つきだけ関数に回す。
  let q = p;
  let w = o;
  for (;;) {
    if (k > 0) {
      if (k === width) { d[w++] = RB; xs = w; } else d[w++] = COMMA;
    }
    d[w++] = DQ;
    const fs = w;
    let c = s[q];
    if (c === BS && s[q + 1] === DQ) {
      p = q; o = w;
      qc = readQuoted();
      q = p; w = o;
      c = s[q];
    } else {
      qc = false;
      for (;;) {
        const v = sv.getUint32(q, true);
        const a = v ^ 0x2c2c2c2c;
        const b = v ^ 0x22222222;
        const e2 = v ^ 0x5c5c5c5c;
        const m = ((((a - 0x01010101) | 0) & ~a) | (((b - 0x01010101) | 0) & ~b) | (((e2 - 0x01010101) | 0) & ~e2)) & 0x80808080;
        ov.setUint32(w, v, true);
        if (m !== 0) {
          const k = (31 - Math.clz32(m & ((0 - m) | 0))) >> 3;
          q += k;
          w += k;
          break;
        }
        q += 4;
        w += 4;
      }
      c = s[q];
      if (c === BS) {
        const x = s[q + 1];
        if (x !== N && !(x === R && s[q + 2] === BS && s[q + 3] === N)) {
          p = q; o = w;
          readPlain();
          q = p; w = o;
          c = s[q];
        }
      }
    }
    empty = w === fs;
    d[w++] = DQ;
    k++;
    if (c === COMMA) { q++; continue; }
    if (c === BS) { q += s[q + 1] === N ? 2 : 4; line++; } // ここで止まるのは LF か CRLF だけ
    break;
  }
  p = q;
  o = w;

  // 単独 CR だけの行などはレコードにしない（errors は残す、B-09）
  if (k === 1 && !qc && empty) { o = recStart; return true; }
  if (width < 0) {
    // 幅の基準は捨てられなかった最初のレコード（B-26）
    width = k;
    d[o++] = RB;
    r0s = recStart;
    r0e = o;
    nErrFirst = nErr;
    rowCount++;
    return true;
  }
  if (k < width) {
    errStart(E_SHORT, 0);
    err.set(S_FIELDS, e);
    e += S_FIELDS.length;
    e = putInt(err, e, k);
    err[e++] = RC;
    growOut(3 * (width - k) + ((len - p) << 2) + 512);
    const b = out;
    for (let j = k; j < width; j++) { b[o++] = COMMA; b[o++] = DQ; b[o++] = DQ; }
    b[o++] = RB;
  } else if (k > width) {
    // 幅を超えた分は out に書いてあるので errors に写して捨てる（中の stray_cr は既に前に出ている）
    errStart(E_LONG, o - xs);
    err.set(S_EXTRA, e);
    e += S_EXTRA.length;
    out.copy(err, e, xs, o);
    e += o - xs;
    err[e++] = RB;
    err[e++] = RC;
    o = xs;
  } else d[o++] = RB;
  rowCount++;
  return true;
}

// ts から始まる text を1ケースとして、header が無いものとして解き、rows まで out に書く。text を閉じる '"' の位置を返す。
// header は text の後ろに来る（JSON.stringify のキー順）ので、ここでは決めない。finishCase で仕上げる。
function doCase(ts) {
  p = ts;
  if (src[p] === 0xef && src[p + 1] === 0xbb && src[p + 2] === 0xbf) p += 3; // 先頭の U+FEFF（B-06）
  line = 1;
  recLine = 1;
  rowCount = 0;
  width = -1;
  e = 0;
  nErr = 0;
  r0s = r0e = -1;
  nErrFirst = 0;
  growOut(64 + ((len - p) << 2) + 512);
  out.set(S_HEAD_COLS, o);
  o += S_HEAD_COLS.length;
  gap = o;
  o += S_NULL_ROWS.length;
  while (readRecord());
  return p;
}

// header の値が分かってから答えを仕上げる。JSON の値として同じなら空白を挟んでよい（採点は値で比べる）。
//   header が無い: 空けておいた所に 'null,"rows":[' を書くだけ。
//   header が有る: 先頭レコードを '{"columns":' の直後へ詰め、後ろに ',"rows":[' と空白を置く。
//                  エラーの row は、先頭レコードまでのものを null、後ろのものを 1 減らす。
function finishCase(hdr) {
  if (width < 0) nErrFirst = nErr;
  growOut(e + 3 * nErr + 64 + ((len - P) << 2) + 512);
  if (!hdr) out.set(S_NULL_ROWS, gap);
  else if (width < 0) {
    out.set(S_EMPTY_ROWS, gap);
    out.fill(32, gap + S_EMPTY_ROWS.length, gap + S_NULL_ROWS.length);
  } else {
    out.copyWithin(gap, r0s, r0e);
    let x = gap + (r0e - r0s);
    out.set(S_ROWS, x);
    x += S_ROWS.length;
    out.fill(32, x, out[r0e] === COMMA ? r0e + 1 : r0e);
  }
  out.set(S_ERRORS, o);
  o += S_ERRORS.length;
  if (!hdr) {
    err.copy(out, o, 0, e);
    o += e;
  } else {
    let from = 0;
    for (let i = 0; i < nErr; i++) {
      const at = rowPos[i];
      err.copy(out, o, from, at);
      o += at - from;
      let t = at;
      let v = 0;
      while (err[t] >= 48 && err[t] <= 57) v = v * 10 + err[t++] - 48;
      if (i < nErrFirst) { out.set(S_NULL, o); o += 4; } else o = putInt(out, o, v - 1);
      from = t;
    }
    err.copy(out, o, from, e);
    o += e - from;
  }
  out[o++] = RB;
  out[o++] = RC;
}

// ===== cases.json の外側の構造を読む（ここは 1ケースに数回しか通らない） =====
let P = 0;
let KA = 0;
let KB = 0;

function ws() {
  let c;
  while ((c = src[P]) === 32 || c === 10 || c === 13 || c === 9) P++;
}
function skipStr() {
  let q = P + 1;
  for (;;) {
    const c = src[q];
    if (c === DQ) break;
    q += c === BS ? 2 : 1;
  }
  if (q >= len) throw BAD;
  P = q + 1;
}
function readKey() {
  ws();
  if (src[P] !== DQ) throw BAD;
  KA = P + 1;
  skipStr();
  KB = P - 1;
  ws();
  if (src[P] !== COLON) throw BAD;
  P++;
  ws();
}
// エスケープを含むキーは一致しない扱い（そのケースは JSON.parse に落ちる）
const keyIs = (k) => KB - KA === k.length && src.compare(k, 0, k.length, KA, KB) === 0;

function skipValue() {
  ws();
  const c = src[P];
  if (c === DQ) { skipStr(); return; }
  if (c === LC || c === LB) {
    const close = c === LC ? RC : RB;
    P++;
    ws();
    if (src[P] === close) { P++; return; }
    for (;;) {
      if (c === LC) readKey();
      skipValue();
      ws();
      if (src[P] === COMMA) { P++; continue; }
      if (src[P] === close) { P++; return; }
      throw BAD;
    }
  }
  const s0 = P;
  while (P < len) {
    const b = src[P];
    if (b === COMMA || b === RC || b === RB || b === 32 || b === 10 || b === 13 || b === 9) break;
    P++;
  }
  if (P === s0) throw BAD;
}

let caseStart = 0;
let inputs = 0;
let texts = 0;
let headers = 0;
let hdrVal = false;
let ok = true;
let done = false;

function parseInput() {
  if (src[P] !== LC) { ok = false; skipValue(); return; }
  P++;
  ws();
  if (src[P] === RC) { P++; return; }
  for (;;) {
    readKey();
    if (keyIs(K_TEXT)) {
      texts++;
      if (src[P] === DQ && texts === 1 && inputs === 1 && ok) {
        const ts = P + 1;
        try {
          P = doCase(ts) + 1;
          done = true;
        } catch (x) {
          if (x !== ODD) throw x;
          ok = false;
          P = ts - 1;
          skipStr();
        }
      } else { ok = false; skipValue(); }
    } else if (keyIs(K_HEADER)) {
      headers++;
      hdrVal = src[P] === 116 && src[P + 1] === 114 && src[P + 2] === 117 && src[P + 3] === 101; // header === true（B-01）
      skipValue();
    } else skipValue();
    ws();
    if (src[P] === COMMA) { P++; continue; }
    if (src[P] === RC) { P++; return; }
    throw BAD;
  }
}

// 1ケースを読む。答えを out に書けたら true、solve.js に回すなら false（caseStart〜P がそのケースの JSON）。
function parseCase() {
  ws();
  if (src[P] !== LC) throw BAD;
  caseStart = P;
  P++;
  inputs = texts = headers = 0;
  hdrVal = done = false;
  ok = true;
  ws();
  if (src[P] === RC) { P++; return false; }
  for (;;) {
    readKey();
    if (keyIs(K_INPUT)) { inputs++; parseInput(); } else skipValue();
    ws();
    if (src[P] === COMMA) { P++; continue; }
    if (src[P] === RC) { P++; break; }
    throw BAD;
  }
  if (!(ok && done && inputs === 1 && texts === 1 && headers <= 1)) return false;
  finishCase(hdrVal);
  return true;
}


let runJson = null;
const loadSolve = async () =>
  runJson ?? (runJson = ((await import(new URL('./solve.js', import.meta.url).href))).runJson);

// 準備走行（header の有無を交互に）。関数は数回呼ばれてから型情報を集め始めるので何周か回す。出力は捨てる。
// 1 周だと最適化解除が残り、2 周から 0（Node 22・24 とも）。余裕を見て 3 周。8 周より net 約 5ms 速い。
for (let k = 0; k < 3; k++) {
  o = 0;
  doCase(len + 8);
  finishCase((k & 1) === 0);
}
o = 0;

// 1ケース書くごとに、たまった分（1MB 以上）をファイルへ出して out の頭から使い直す。触るページが 12MB → 約 2MB になり、
// ページフォールトの高い gVisor（runsc）で net 約 224ms → 約 204ms、runc でも約 136ms → 約 125ms（合成入力、15 回の中央値）。
const FLUSH = 1 << 20;
const answersPath = join(outputDir, 'answers.json');
let whole = !isUtf8(src.subarray(0, len));
const fdOut = openSync(answersPath, 'w');
if (!whole) {
  try {
    ws();
    if (src[P] !== LB) throw BAD;
    P++;
    out[o++] = LB;
    ws();
    if (src[P] === RB) P++;
    else {
      for (let k = 0; ; k++) {
        if (k > 0) out[o++] = COMMA;
        const co = o;
        if (!parseCase()) {
          if (process.env.FBCSV_TRACE) process.stderr.write(`fallback case ${k}\n`);
          o = co;
          const answer = (await loadSolve())(JSON.parse(src.toString('utf8', caseStart, P)).input);
          growOut(Buffer.byteLength(answer) + ((len - P) << 2) + 512);
          o += out.write(answer, o);
        }
        if (o >= FLUSH) { writeSync(fdOut, out, 0, o); o = 0; }
        ws();
        if (src[P] === COMMA) { P++; continue; }
        if (src[P] === RB) { P++; break; }
        throw BAD;
      }
    }
    out[o++] = RB;
    ws();
    if (P !== len) throw BAD;
  } catch (x) {
    if (process.env.FBCSV_TRACE) process.stderr.write(`fallback whole: ${(x).message}\n`);
    whole = true; // 想定外は何であれ元のやり方で解き直す（そちらで同じ例外が出れば基準と同じく落ちる）
  }
}

if (!whole) { writeSync(fdOut, out, 0, o); closeSync(fdOut); }
else {
  closeSync(fdOut);
  // 元のやり方: JSON.parse して各ケースを runJson（JSON.stringify(run(input)) とバイト単位で同じ）で解く
  const solve = await loadSolve();
  const cases = JSON.parse(src.toString('utf8', 0, len));
  const fd = openSync(answersPath, 'w');
  writeSync(fd, '[');
  cases.forEach((c, k) => writeFileSync(fd, (k ? ',' : '') + solve(c.input)));
  writeSync(fd, ']');
  closeSync(fd);
}
