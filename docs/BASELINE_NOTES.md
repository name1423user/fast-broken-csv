# 基準（csv-reader 1.0.0）の挙動メモ

SPEC.md 3章を補うメモ。基準 `kit-dl/csv-reader-speed-01-run-20261121-kit/baselines/csv-reader/vendor/csv-reader/index.js`（193行）を読み、疑わしい点は基準を実際に呼んで確かめた（2026-11-22、手元の Node）。基準のコードは写していない。挙動を文章と入出力で書く。

- 表記: 入力は `text` を JSON 文字列で、`h=true` / `h=false` は `header`。出力は `{columns, rows, errors}` の JSON。
- 項目番号（B-xx）は `docs/CHECKS.md` の細目と対応する。
- SPEC 3章と**矛盾する点はなかった**。以下は SPEC に書かれていない細部。

## 答えの形

- B-01: `header` は**値がちょうど `true` のときだけ**ヘッダーありとして扱う。`1` や `"true"` はヘッダーなしと同じ（`columns: null`）。`text` は文字列に変換してから読む。
- B-02: `header: false` なら `columns` は常に `null`。
- B-03: `header: true` でレコードが1つもない（空文字列、BOM のみ、改行のみなど）とき、`columns` は **`[]`（空配列）**。`null` ではない。SPEC 3章には書かれていない。
- B-04: `header: true` でヘッダーのレコードだけのとき、`columns` はそのレコード、`rows` は `[]`、`errors` はヘッダーのレコードで出たものだけ。
- B-05: 答えのキーは `columns`・`rows`・`errors` の3つだけ。

## レコードの区切り

- B-06: 先頭（テキストの0文字目）の U+FEFF を1つだけ捨てる。2つ目以降や、2行目以降の先頭にある U+FEFF は普通の文字としてフィールドに残る。BOM を捨てた直後が `"` なら、そのフィールドは引用符つきとして読む。
- B-07: レコードの区切りは引用符の外の LF と CRLF。
- B-08: レコードを読み始める前に、LF と CRLF だけが続く部分（空行）を飛ばす。飛ばした行も `line` に数える。
- B-09: 単独の CR（後ろが LF でない CR）だけの行は、いったんレコードとして読み始める。CR は捨てられて `stray_cr` が出る。結果がフィールド1個・空文字・引用符なしになったら、そのレコードは捨てる（rows にも columns にも入らず、幅の基準にもならない）。**ただし出た `stray_cr` は errors に残る**。そのエラーの `row` は「次のレコードが入る位置」（ヘッダー待ちなら `null`）。
- B-10: 空白だけの行（例 `" "`）、カンマだけの行（`","`）、`""` だけの行はレコードになる（文字があるので捨てない）。
- B-11: 引用符の外の単独 CR は捨て、そのたびに `stray_cr` を1つ出す（2つ続けば2つ）。フィールドは CR を除いた文字でつながる（`a\r\rb` → `ab`）。
- B-12: **引用符の外の単独 CR は `line` を進めない**。`line` が進むのは、引用符の外では LF と CRLF（各1回）だけ。
- B-13: テキスト末尾が改行なしでも、最後のレコードは普通に終わる。末尾の改行の後ろに何もなければレコードは増えない。
- B-14: テキスト末尾の単独 CR は `stray_cr` になる（`a\r` → rows `[["a"]]`、stray_cr 1件）。改行の後ろに CR だけが残る場合（`a\n\r`）は B-09 のとおりレコードにはならず、`stray_cr` だけが残る。

## 引用符

- B-15: フィールドの**最初の文字**が `"` のときだけ引用符つきとして読む。前に空白などがあれば引用なしで、`"` は普通の文字（`␣"a"` → `␣"a"`）。
- B-16: 引用符の中: `""` は `"` 1つ。CRLF は LF 1つ、単独 CR は LF 1つ、LF はそのまま。引用符の中の LF・CRLF・単独 CR は、それぞれ `line` を1つ進める。引用符の中では `stray_cr` は出ない。
- B-17: 閉じ引用符は、後ろが `"` でない最初の `"`。閉じ引用符の直後が、テキスト末尾・カンマ・LF・CRLF ならフィールドはそこで終わる（エラーなし）。
- B-18: それ以外なら、次のカンマか改行（LF / CRLF）かテキスト末尾までの文字を、引用なしと同じ規則でそのまま値の後ろに足す。この部分の `"` は普通の文字（`"a"b"c"` → `ab"c"`）。この部分の単独 CR は捨てて `stray_cr`。
- B-19: `quote_junk` は、閉じ引用符の後ろで**1文字以上を足したとき**だけ、フィールドの終わりで1回出す。後ろが単独 CR だけ（`"a"\r,b`）なら `stray_cr` だけで `quote_junk` は出ない。`stray_cr` と `quote_junk` が両方出るときは `stray_cr` が先。
- B-20: `quote_junk` にはどのフィールドかを示すキーはない（`code`・`line`・`row` だけ）。`line` はフィールドのある行ではなく、**レコードが始まった行**。

## 閉じない引用符

- B-21: 引用符つきフィールドで、テキスト末尾まで閉じ引用符（後ろが `"` でない `"`）が見つからないとき、閉じない引用符になる。`""` の組は途中で消費されるので、`"abc""` も閉じない（最後の `""` が組になる）。
- B-22: そのとき、開き引用符を普通の文字 `"` として値の先頭に置き、**開き引用符の直後から**引用なしとして読み直す。読み直しは普通の引用なしフィールドと同じ: 次のカンマか LF / CRLF で終わり、単独 CR は捨てて `stray_cr`、`""` は2文字のまま残る（`"a"" ,b` → `["\"a\"\" ", "b"]`）。
- B-23: 読み直しで `line` は開き引用符の行に戻り、引用なしの規則（LF と CRLF だけ数える）で数え直す。閉じ探しの途中で数えた行は捨てる。
- B-24: 読み直したフィールドがカンマで終われば、同じレコードの次のフィールドに進む。次のフィールドが `"` で始まれば、またそこから引用符つきとして読む（閉じるかどうかはあらためて判定される。`"a,""` → `["\"a", ""]`、エラーは unterminated_quote 1件）。改行で終われば次の行は新しいレコード（`"a\nb\nc` → 3レコード）。
- B-25: `unterminated_quote` は閉じないと分かった時点で出す。読み直し中の `stray_cr` はその後ろに並ぶ。
- 実装上の注意（事実）: 基準は閉じない引用符のたびにテキスト末尾まで探す。答えを同じにする限り、探し方は自由。

## 幅揃え

- B-26: 幅の基準は、捨てられなかった**最初のレコード**のフィールド数。`header: true` ならヘッダー、`header: false` ならデータの1行目。
- B-27: 幅の基準のレコード（ヘッダー、またはヘッダーなしの1行目）には `short_row` / `long_row` は出ない。`columns` は幅揃えを受けない。
- B-28: 短いレコードは空文字で埋め、`short_row`（`fields`: 元のフィールド数）。長いレコードは幅で切り、`long_row`（`extra`: 切った分のフィールドの配列。値は引用符処理後の文字列で、LF を含むこともある）。
- B-29: 末尾カンマはフィールドを1つ増やす（`a,` → `["a",""]`）。

## エラー（キー・順序・line・row）

- B-30: キーは `code`・`line`・`row` の3つ。`short_row` だけ `fields`（数値）、`long_row` だけ `extra`（文字列の配列）が加わる。**`col` や位置などのキーはない**。`code` は `stray_cr`・`quote_junk`・`unterminated_quote`・`short_row`・`long_row` の5種類。
- B-31: `line` はエラーが起きた位置の行ではなく、**そのレコードが始まった行**（全エラー共通）。数え方は B-08・B-12・B-16・B-23。
- B-32: `row` はそのレコードの `rows` での位置。ヘッダーのレコードは `null`。B-09 で捨てたレコードは「次に入る位置」。
- B-33: ヘッダーのレコードでも `stray_cr`・`quote_junk`・`unterminated_quote` は出る（`row: null`）。`short_row`/`long_row` は出ない。
- B-34: 並び順はテキストを読んだ順。レコードの中では `stray_cr` と `unterminated_quote` は出会った時点、`quote_junk` はそのフィールドの終わり、`short_row`/`long_row` はレコードの終わり（そのレコードの最後）。

## 確かめた入出力の例

基準を呼んだ結果（抜粋）。`errors` の要素は `{code,line,row,...}`。

| # | text | header | columns | rows | errors |
|---|---|---|---|---|---|
| E1 | `""`（空文字列） | true | `[]` | `[]` | `[]` |
| E2 | `""` | false | `null` | `[]` | `[]` |
| E3 | `"﻿"` | true | `[]` | `[]` | `[]` |
| E4 | `"﻿﻿a"` | false | null | `[["﻿a"]]` | `[]` |
| E5 | `"a\n﻿b"` | false | null | `[["a"],["﻿b"]]` | `[]` |
| E6 | `"\n\r\n\n"` | true | `[]` | `[]` | `[]` |
| E7 | `"a\n\r\r\nb"` | false | null | `[["a"],["b"]]` | stray_cr L2 r1 |
| E8 | `"\r\r\na,b\n"` | true | `["a","b"]` | `[]` | stray_cr L1 r=null |
| E9 | `"h\n\r"` | true | `["h"]` | `[]` | stray_cr L2 r0 |
| E10 | `"a\r\rb\nc"` | false | null | `[["ab"],["c"]]` | stray_cr L1 r0 ×2 |
| E11 | `"a\rb\nc,d"` | false | null | `[["ab"],["c"]]` | stray_cr L1 r0; long_row L2 r1 extra `["d"]` |
| E12 | `" \nx"` | false | null | `[[" "],["x"]]` | `[]` |
| E13 | `"a\n,\n"` | false | null | `[["a"],[""]]` | long_row L2 r1 extra `[""]` |
| E14 | `"a\n\"\"\n"` | false | null | `[["a"],[""]]` | `[]` |
| E15 | `"a\r"` | false | null | `[["a"]]` | stray_cr L1 r0 |
| E16 | `"x,\"a\"b\"c\",d\n"` | false | null | `[["x","ab\"c\"","d"]]` | quote_junk L1 r0 |
| E17 | `"\"a\"\r,b\n"` | false | null | `[["a","b"]]` | stray_cr L1 r0 |
| E18 | `"\"a\"x\ry,b\n"` | false | null | `[["axy","b"]]` | stray_cr L1 r0; quote_junk L1 r0 |
| E19 | `"a\nb,\"c\r\nd\"e\n"` | false | null | `[["a"],["b"]]` | quote_junk L2 r1; long_row L2 r1 extra `["c\nde"]` |
| E20 | `"\"x\ry\"\nz,w"` | false | null | `[["x\ny"],["z"]]` | long_row **L3** r1 extra `["w"]` |
| E21 | `"\"abc\"\""` | false | null | `[["\"abc\"\""]]` | unterminated_quote L1 r0 |
| E22 | `"\"a,\"\""` | false | null | `[["\"a",""]]` | unterminated_quote L1 r0 |
| E23 | `"x\n\"a\nb\r\nc,d\re\n"` | false | null | `[["x"],["\"a"],["b"],["c"]]` | unterminated_quote L2 r1; stray_cr L4 r3; long_row L4 r3 extra `["de"]` |
| E24 | `"\"a\rb"` | false | null | `[["\"ab"]]` | unterminated_quote L1 r0; stray_cr L1 r0 |
| E25 | `"\"h\r,k\n1,2,3"` | true | `["\"h","k"]` | `[["1","2"]]` | unterminated_quote L1 r=null; stray_cr L1 r=null; long_row L2 r0 extra `["3"]` |
| E26 | `"a,b\n\"p,\"q,\"r\n"` | false | null | `[["a","b"],["p,q","\"r"]]` | quote_junk L2 r1; unterminated_quote L2 r1 |
| E27 | `"a,\"b\n\n\nc"` | false | null | `[["a","\"b"],["c",""]]` | unterminated_quote L1 r0; short_row L4 r1 fields 1 |
| E28 | `"\"a\"\" ,b"` | false | null | `[["\"a\"\" ","b"]]` | unterminated_quote L1 r0 |
| E29 | `"\"h\"x,\r\n"` | true | `["hx",""]` | `[]` | quote_junk L1 r=null |
| E30 | `"a,b\nc\n"` | true | `["a","b"]` | `[["c",""]]` | short_row L2 r0 fields 1 |
| E31 | `"a,b,c\nd\ne,f,g,h,i\n"` | false | null | `[["a","b","c"],["d","",""],["e","f","g"]]` | short_row L2 r1 fields 1; long_row L3 r2 extra `["h","i"]` |
| E32 | `"a\r\n\r\n\r\nb,c"` | false | null | `[["a"],["b"]]` | long_row L4 r1 extra `["c"]` |
| E33 | `"﻿\"a\",b"` | false | null | `[["a","b"]]` | `[]` |
| E34 | `" \"a\""` | false | null | `[[" \"a\""]]` | `[]` |
| E35 | `"a\nb"`（header に `1`、`"true"`） | 1 / "true" | `null` | `[["a"],["b"]]` | `[]` |

再現用の呼び方: `node --input-type=module -e` で `kit-dl/.../baselines/csv-reader/solve.js` の `run` を import し、`{text, header}` を渡す。エラーのキーは `Object.keys` で `code, line, row, fields` の4つ（short_row の場合）と確認した。
