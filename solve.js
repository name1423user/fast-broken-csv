// csv-reader 1.0.0 と同じ答えを返す CSV の読み込み（M2-T02、M3 で高速化）。区切りは indexOf で探し、値は slice で切り出す。
// 読みを小さな関数に分けているのは、run 1回で長いテキストを読むため（大きな run の中のループは OSR 頼みになり遅い）。
// 挙動の根拠は docs/BASELINE_NOTES.md（B-xx）。読みの状態はモジュールの変数に置き（関数を run の外に出すため）、run の最初に全部初期化し、終わりに参照を捨てる。ケース間で持ち越さない。

const QUOTE = 34;
const COMMA = 44;
const LF = 10;
const CR = 13;

// 読みの状態。run の最初に必ず初期化し、ケース間で持ち越さない。
let text = '';
let n = 0;
let errors = null;
let i = 0;
let line = 1;
let recLine = 1;
let row = null;
let nextCR = -1;
let nextComma = -1;
let nextLF = -1;
let quotedClosed = false;
let header = false;
let rows = null;
let columns = null;
let width = -1; // 幅の基準（捨てられなかった最初のレコードのフィールド数、B-26）

// 引用なしの読み（B-11・B-18・B-22）。カンマ・LF・CRLF・末尾の手前まで。単独 CR は捨てて stray_cr。
function readPlain(p) {
  // 速い経路: 次のカンマ・LF の手前に CR が無ければ slice 1回（CRLF の CR で止まる場合も含む）
  if (nextComma < p) { nextComma = text.indexOf(',', p); if (nextComma < 0) nextComma = n; }
  if (nextLF < p) { nextLF = text.indexOf('\n', p); if (nextLF < 0) nextLF = n; }
  if (nextCR < p) { nextCR = text.indexOf('\r', p); if (nextCR < 0) nextCR = n; }
  const stop = nextComma < nextLF ? nextComma : nextLF;
  if (nextCR >= stop) { i = stop; return text.slice(p, stop); }
  if (nextCR === stop - 1 && stop === nextLF && stop < n) { i = stop - 1; return text.slice(p, stop - 1); }
  let out = '';
  let seg = p;
  while (p < n) {
    const c = text.charCodeAt(p);
    if (c === COMMA || c === LF) break;
    if (c === CR) {
      if (text.charCodeAt(p + 1) === LF) break;
      out += text.slice(seg, p);
      errors.push({ code: 'stray_cr', line: recLine, row });
      seg = ++p;
      continue;
    }
    p++;
  }
  i = p;
  return seg === p ? out : out + text.slice(seg, p);
}

// 引用符つきフィールドを q から読む。閉じたら quotedClosed を立てる。
function readQuoted(q) {
  // 引用符つき（B-16・B-17）。閉じるまで line は仮に数え、閉じたときだけ確定する。
  let p = q + 1;
  let seg = p;
  let out = '';
  let nl = 0;
  let closed = false;
  // 次の `"` まで indexOf で飛ぶ。間の CR は LF に置き換え（CRLF は LF 1つ）、行数は LF の数 + LF が続かない CR の数。
  // 末尾まで探してよい: 閉じない引用符は1テキストに高々1つ（開き引用符の連なりが最後の奇数長の連なりのときだけ）
  for (;;) {
    let qp = text.indexOf('"', p);
    if (qp < 0) qp = n;
    if (nextCR < p) { nextCR = text.indexOf('\r', p); if (nextCR < 0) nextCR = n; }
    if (nextLF < p) { nextLF = text.indexOf('\n', p); if (nextLF < 0) nextLF = n; }
    while (nextLF < qp) { nl++; nextLF = text.indexOf('\n', nextLF + 1); if (nextLF < 0) nextLF = n; }
    while (nextCR < qp) {
      out += text.slice(seg, nextCR) + '\n';
      if (text.charCodeAt(nextCR + 1) === LF) seg = nextCR + 2;
      else { seg = nextCR + 1; nl++; }
      nextCR = text.indexOf('\r', seg); if (nextCR < 0) nextCR = n;
    }
    if (qp >= n) break;
    if (text.charCodeAt(qp + 1) === QUOTE) { out += text.slice(seg, qp + 1); p = seg = qp + 2; }
    else { out += text.slice(seg, qp); p = qp + 1; closed = true; break; }
  }
  if (closed) {
    line += nl;
    quotedClosed = true;
    const c = text.charCodeAt(p);
    if (p >= n || c === COMMA || c === LF || (c === CR && text.charCodeAt(p + 1) === LF)) {
      i = p;
      return out;
    } else {
      const junk = readPlain(p); // B-18・B-19
      if (junk.length > 0) errors.push({ code: 'quote_junk', line: recLine, row });
      return out + junk;
    }
  } else {
    // 閉じない引用符（B-21〜B-25）: `"` を文字として、直後から引用なしで読み直す
    errors.push({ code: 'unterminated_quote', line: recLine, row });
    nextCR = nextLF = -1; // 閉じ探しで末尾まで進めた位置は q より後ろを指すので捨てる
    return '"' + readPlain(q + 1);
  }
}

// 1レコードのフィールドを読み、レコード末の改行の後ろまで進む。quotedClosed は最後のフィールドが閉じた引用符つきか。
function readFields() {
  const fields = [];
  for (;;) {
    quotedClosed = false;
    fields.push(text.charCodeAt(i) === QUOTE ? readQuoted(i) : readPlain(i));
    const c = text.charCodeAt(i);
    if (c === COMMA) { i++; continue; }
    if (c === LF) { i++; line++; }
    else if (c === CR) { i += 2; line++; } // readPlain は CRLF の CR でしか止まらない
    return fields;
  }
}


// 1レコードを読んで rows（または columns）に入れる。テキストの末尾なら false。run のループを小さく保つため外に出す。
function readRecord() {
  // 空行（LF / CRLF だけ）を飛ばす（B-08）
  while (i < n) {
    const c = text.charCodeAt(i);
    if (c === LF) { i++; line++; }
    else if (c === CR && text.charCodeAt(i + 1) === LF) { i += 2; line++; }
    else break;
  }
  if (i >= n) return false;

  recLine = line;
  row = header && width < 0 ? null : rows.length;
  const fields = readFields();

  // 単独 CR だけの行などはレコードにしない（errors は残す、B-09）
  if (fields.length === 1 && !quotedClosed && fields[0] === '') return true;

  if (width < 0) {
    width = fields.length;
    if (header) columns = fields;
    else rows.push(fields);
    return true;
  }
  const len = fields.length;
  if (len < width) {
    errors.push({ code: 'short_row', line: recLine, row, fields: len });
    while (fields.length < width) fields.push('');
  } else if (len > width) {
    errors.push({ code: 'long_row', line: recLine, row, extra: fields.slice(width) });
    fields.length = width;
  }
  rows.push(fields);
  return true;
}

/** @param {{text: string, header: boolean}} input */
export function run(input) {
  text = String(input.text);
  header = input.header === true; // B-01
  n = text.length;
  rows = [];
  errors = [];
  columns = null;
  width = -1;
  i = text.charCodeAt(0) === 0xfeff ? 1 : 0; // B-06
  line = 1;
  recLine = 1;
  row = null;
  nextCR = nextComma = nextLF = -1;
  quotedClosed = false;
  while (readRecord());
  const out = { columns: header ? (columns ?? []) : null, rows, errors };
  text = ''; rows = errors = columns = row = null; // 次の run に持ち越さない
  return out;
}
