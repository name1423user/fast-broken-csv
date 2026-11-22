// csv-reader 1.0.0 と同じ答えを返す CSV の読み込み（M2-T02）。1パス、charCodeAt で走査し、値は slice で切り出す。
// 挙動の根拠は docs/BASELINE_NOTES.md（B-xx）。状態はすべて run() の中に置き、ケース間で持ち越さない。

const QUOTE = 34;
const COMMA = 44;
const LF = 10;
const CR = 13;

/** @param {{text: string, header: boolean}} input */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true; // B-01
  const n = text.length;
  const rows = [];
  const errors = [];
  let columns = null;
  let width = -1; // 幅の基準（捨てられなかった最初のレコードのフィールド数、B-26）
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; // B-06
  let line = 1;
  let recLine = 1;
  let row = null;

  // 引用なしの読み（B-11・B-18・B-22）。カンマ・LF・CRLF・末尾の手前まで。単独 CR は捨てて stray_cr。
  function readPlain(p) {
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

  for (;;) {
    // 空行（LF / CRLF だけ）を飛ばす（B-08）
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === LF) { i++; line++; }
      else if (c === CR && text.charCodeAt(i + 1) === LF) { i += 2; line++; }
      else break;
    }
    if (i >= n) break;

    recLine = line;
    row = header && width < 0 ? null : rows.length;
    const fields = [];
    let lastQuoted = false;

    for (;;) {
      let value;
      lastQuoted = false;
      if (text.charCodeAt(i) === QUOTE) {
        // 引用符つき（B-16・B-17）。閉じるまで line は仮に数え、閉じたときだけ確定する。
        const q = i;
        let p = q + 1;
        let seg = p;
        let out = '';
        let nl = 0;
        let closed = false;
        for (;;) {
          // 末尾まで探してよい: 閉じない引用符は1テキストに高々1つ（開き引用符の連なりが最後の奇数長の連なりのときだけ）
          if (p >= n) break;
          const c = text.charCodeAt(p);
          if (c === QUOTE) {
            if (text.charCodeAt(p + 1) === QUOTE) { out += text.slice(seg, p + 1); p += 2; seg = p; }
            else { out += text.slice(seg, p); p++; closed = true; break; }
          } else if (c === CR) {
            out += text.slice(seg, p) + '\n';
            nl++;
            p += text.charCodeAt(p + 1) === LF ? 2 : 1;
            seg = p;
          } else {
            if (c === LF) nl++;
            p++;
          }
        }
        if (closed) {
          line += nl;
          lastQuoted = true;
          const c = text.charCodeAt(p);
          if (p >= n || c === COMMA || c === LF || (c === CR && text.charCodeAt(p + 1) === LF)) {
            i = p;
            value = out;
          } else {
            const junk = readPlain(p); // B-18・B-19
            value = out + junk;
            if (junk.length > 0) errors.push({ code: 'quote_junk', line: recLine, row });
          }
        } else {
          // 閉じない引用符（B-21〜B-25）: `"` を文字として、直後から引用なしで読み直す
          errors.push({ code: 'unterminated_quote', line: recLine, row });
          value = '"' + readPlain(q + 1);
        }
      } else {
        value = readPlain(i);
      }
      fields.push(value);

      const c = text.charCodeAt(i);
      if (c === COMMA) { i++; continue; }
      if (c === LF) { i++; line++; }
      else if (c === CR) { i += 2; line++; } // readPlain は CRLF の CR でしか止まらない
      break;
    }

    // 単独 CR だけの行などはレコードにしない（errors は残す、B-09）
    if (fields.length === 1 && !lastQuoted && fields[0] === '') continue;

    if (width < 0) {
      width = fields.length;
      if (header) columns = fields;
      else rows.push(fields);
      continue;
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
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
