# 満たすべき項目の一覧

`spec-analyst` が作成し、`grader` が状態欄を更新する。各行に根拠を付けること。

- 根拠の略記: `SPEC` = `SPEC.md`、`NOTES` = `docs/BASELINE_NOTES.md`、`基準` = `kit-dl/csv-reader-speed-01-run-20261121-kit/baselines/csv-reader/vendor/csv-reader/index.js`。
- 重み: 必須 = 1つでも外れると賞金なし（採点の条件） / 目標 = 順位・成功基準に効く / 体裁 = 提出の条件。
- 細目（B-xx）はすべて「基準と同じ答え」の内訳。AC-001〜003 の失敗を振り分けるときの手がかりに使う。例の番号（E-xx）は NOTES の「確かめた入出力の例」。

## 受け入れ条件（SPEC 3章）

| ID | 区分 | 要求 | 期待 | 重み | 状態 | 担当 | 根拠 |
|---|---|---|---|---|---|---|---|
| AC-001 | 一致 | 練習セット6ケースで基準と一致 | `grade-local`（docker）で `passed = 1`、`cases_passed = 6` | 必須 | PASS | parser-engineer | SPEC:50；grade-local（docker）`cases_passed 6/6, passed 1`（.check/20261122-103500/test.log） |
| AC-002 | 一致 | 生成器の 300 ケース（seed 50×6）で基準と一致 | `scripts/fuzz.mjs` が不一致 0 件 | 必須 | PASS | parser-engineer | SPEC:51；生成 300 件 不一致 0（.check/20261122-103500/test.log） |
| AC-003 | 一致 | 手作りの境界ケースで基準と一致 | `scripts/fuzz.mjs` の固定ケースで不一致 0 件（NOTES の E1〜E35 を含めるとよい） | 必須 | PASS | parser-engineer | SPEC:52；固定 106 件（53 文字列×header true/false）不一致 0（.check/20261122-103500/test.log）。E1〜E35 の全部は入っていない（E35 など） |
| AC-004 | 再現性 | 同じ入力で2回実行し `answers.json` がバイト一致 | `grade-local` の二重実行が通る | 必須 | PASS | determinism-auditor（確認） | SPEC:53；`L1 regrade reproduced byte for byte`（.check/20261122-103500/test.log） |
| AC-005 | 速度 | 練習セットの CPU 時間が基準の 0.5 倍以下（Node 22） | `scripts/bench.mjs` の中央値の比 ≤ 0.5 | 目標 | PASS | perf-engineer | bench 比 0.216（Docker・Node 22、--runs 10、2026-11-22 M3 第2弾）
| AC-006 | 資源 | 1回の実行が 10 秒・1024MB 以内（docker、1 CPU） | `grade-local` が時間切れ・メモリ超過なく終わる | 必須 | PASS | perf-engineer | SPEC:55；grade-local `status finished`、時間切れ・メモリ超過の表示なし（.check/20261122-103500/test.log） |
| AC-007 | 提出 | リポジトリ 1MiB 以下、MIT、テンプレどおりの README、About 設定 | `du`、`gh repo view` で確認 | 体裁 | TODO | リード（release-auditor が確認） | SPEC:56；M4 の範囲。規約チェックは OK（32 ファイル / 0.07 MiB、.check/20261122-103500/compliance.log）だが公開・README・About は未確認 |

## 基準の挙動の細目（BASELINE_NOTES）

| ID | 区分 | 要求 | 期待 | 重み | 状態 | 担当 | 根拠 |
|---|---|---|---|---|---|---|---|
| B-01 | 答えの形 | `header` はちょうど `true` のときだけヘッダーあり | `header: 1` / `"true"` は `columns: null`（E35） | 必須 | PASS | parser-engineer | NOTES B-01；fuzz 固定ケース `header: 1`・`"true"` で一致（410 件、M2-T03 追加）
| B-02 | 答えの形 | `header: false` なら `columns: null` | E2 | 必須 | PASS | parser-engineer | NOTES B-02、基準:192；fuzz 406 件一致（.check/20261122-103500） |
| B-03 | 答えの形 | `header: true` でレコードなしなら `columns: []` | E1・E3・E6 | 必須 | PASS | parser-engineer | NOTES B-03、基準:192；fuzz 406 件一致（.check/20261122-103500） |
| B-04 | 答えの形 | ヘッダーのみなら `rows: []` | `"h"`・`"h\n"` → columns `["h"]`、rows `[]` | 必須 | PASS | parser-engineer | NOTES B-04；fuzz 406 件一致（.check/20261122-103500） |
| B-05 | 答えの形 | 答えのキーは columns・rows・errors だけ | 余分なキーなし | 必須 | PASS | parser-engineer | NOTES B-05、基準:192；fuzz 406 件一致（.check/20261122-103500） |
| B-06 | 区切り | 先頭の U+FEFF を1つだけ捨てる。他の位置は文字として残す | E4・E5・E33 | 必須 | PASS | parser-engineer | NOTES B-06、基準:44；fuzz 406 件一致（.check/20261122-103500）。途中の BOM は `\uFEFF\uFEFF` で確認（E5 の改行後の BOM は固定ケースになし） |
| B-07 | 区切り | レコードは引用符の外の LF / CRLF で終わる | 例: E31 | 必須 | PASS | parser-engineer | NOTES B-07；fuzz 406 件一致（.check/20261122-103500） |
| B-08 | 区切り | LF / CRLF だけの行は飛ばし、line には数える | E6・E32 | 必須 | PASS | parser-engineer | NOTES B-08、基準:151-163；fuzz 406 件一致（.check/20261122-103500） |
| B-09 | 区切り | 単独 CR だけの行はレコードにしないが stray_cr は残す（row は次に入る位置） | E7・E8・E9 | 必須 | PASS | parser-engineer | NOTES B-09、基準:176-177；fuzz 406 件一致（.check/20261122-103500） |
| B-10 | 区切り | 空白だけ・カンマだけ・`""` だけの行はレコード | E12・E13・E14 | 必須 | PASS | parser-engineer | NOTES B-10；fuzz 406 件一致（.check/20261122-103500） |
| B-11 | 区切り | 引用符の外の単独 CR は捨て、1つごとに stray_cr | E10 | 必須 | PASS | parser-engineer | NOTES B-11、基準:74-82；fuzz 406 件一致（.check/20261122-103500） |
| B-12 | line | 引用符の外の単独 CR は line を進めない | E11（2行目のレコードが L2） | 必須 | PASS | parser-engineer | NOTES B-12；fuzz 406 件一致（.check/20261122-103500）。固定ケースに E11 型（CR の後の行のエラー）はなし、生成ケースの stray_cr の後の short/long_row で裏付け |
| B-13 | 区切り | 末尾が改行なしでも最後のレコードを出す。末尾の改行でレコードは増えない | `"h"`・`"h\n"` が同じ答え | 必須 | PASS | parser-engineer | NOTES B-13；fuzz 406 件一致（.check/20261122-103500） |
| B-14 | 区切り | テキスト末尾の単独 CR は stray_cr | E15、`"a\n\r"` | 必須 | PASS | parser-engineer | NOTES B-14；fuzz 406 件一致（.check/20261122-103500） |
| B-15 | 引用符 | フィールドの最初の文字が `"` のときだけ引用符つき | E34 | 必須 | PASS | parser-engineer | NOTES B-15、基準:171；fuzz 406 件一致（.check/20261122-103500） |
| B-16 | 引用符 | 中の `""`→`"`、CRLF / 単独 CR → LF、それぞれ line を1つ進める | E20・E19 | 必須 | PASS | parser-engineer | NOTES B-16、基準:98-120；fuzz 406 件一致（.check/20261122-103500） |
| B-17 | 引用符 | 閉じ引用符の直後が末尾・カンマ・LF・CRLF ならエラーなし | `"\"a\"\"b\",c"` → `["a\"b","c"]` | 必須 | PASS | parser-engineer | NOTES B-17、基準:128-143；fuzz 406 件一致（.check/20261122-103500） |
| B-18 | 引用符 | 閉じ引用符の後ろは次のカンマ / 改行まで引用なしの規則で足す | E16・E18 | 必須 | PASS | parser-engineer | NOTES B-18、基準:144-145；fuzz 406 件一致（.check/20261122-103500） |
| B-19 | 引用符 | quote_junk は1文字以上足したときだけ、フィールドの終わりで1回。stray_cr が先 | E17（出ない）・E18（stray_cr→quote_junk） | 必須 | PASS | parser-engineer | NOTES B-19；fuzz 固定ケース `"a"x\ry,b` で stray_cr→quote_junk の順を確認（410 件一致、M2-T03 追加）
| B-20 | エラー | quote_junk の line はレコード開始行、フィールドを示すキーなし | E19 | 必須 | PASS | parser-engineer | NOTES B-20；fuzz 406 件一致（.check/20261122-103500）。複数行レコードでの line は生成ケース（note 列の quote_junk）で裏付け |
| B-21 | 閉じない引用符 | テキスト末尾まで閉じなければ閉じない引用符（`""` は組で消費） | E21・E28 | 必須 | PASS | parser-engineer | NOTES B-21、基準:121；fuzz 406 件一致（.check/20261122-103500） |
| B-22 | 閉じない引用符 | `"` を値の先頭に置き、開き引用符の直後から引用なしで読み直す | E23・E24・E28 | 必須 | PASS | parser-engineer | NOTES B-22、基準:121-127；fuzz 406 件一致（.check/20261122-103500） |
| B-23 | 閉じない引用符 | 読み直しで line を開き引用符の行に戻して数え直す | E23・E27 | 必須 | PASS | parser-engineer | NOTES B-23；fuzz 406 件一致（.check/20261122-103500）。読み直し後の行のエラーは生成ケース（閉じない引用符の後の壊れた行）で裏付け |
| B-24 | 閉じない引用符 | 読み直し後の次のフィールドが `"` で始まれば、あらためて引用符つきで判定 | E22・E26 | 必須 | PASS | parser-engineer | NOTES B-24；fuzz 406 件一致（.check/20261122-103500）。固定 `a,"b,""\n` で確認 |
| B-25 | エラー順 | unterminated_quote を先に、読み直し中の stray_cr を後に | E24・E25 | 必須 | PASS | parser-engineer | NOTES B-25；fuzz 406 件一致（.check/20261122-103500） |
| B-26 | 幅揃え | 幅は捨てられなかった最初のレコード（ヘッダーなしならデータ1行目） | E31・E8 | 必須 | PASS | parser-engineer | NOTES B-26、基準:179；fuzz 406 件一致（.check/20261122-103500） |
| B-27 | 幅揃え | 幅の基準のレコードと columns は幅揃えを受けない | E29（columns に short なし） | 必須 | PASS | parser-engineer | NOTES B-27、基準:180-183；fuzz 406 件一致（.check/20261122-103500） |
| B-28 | 幅揃え | short_row は空文字で埋め fields、long_row は切って extra | E30・E31・E19 | 必須 | PASS | parser-engineer | NOTES B-28、基準:184-189；fuzz 406 件一致（.check/20261122-103500） |
| B-29 | 幅揃え | 末尾カンマはフィールドを1つ増やす | `"a,\n"` → `[["a",""]]` | 必須 | PASS | parser-engineer | NOTES B-29；fuzz 406 件一致（.check/20261122-103500） |
| B-30 | エラー | キーは code・line・row（＋short_row の fields、long_row の extra）だけ | col などのキーなし | 必須 | PASS | parser-engineer | NOTES B-30、基準:50-52, 185, 188；fuzz 406 件一致（.check/20261122-103500） |
| B-31 | エラー | line はレコードの開始行（全エラー共通） | E19・E23 | 必須 | PASS | parser-engineer | NOTES B-31；fuzz 406 件一致（.check/20261122-103500） |
| B-32 | エラー | row は rows での位置、ヘッダーは null | E8・E25・E30 | 必須 | PASS | parser-engineer | NOTES B-32、基準:166；fuzz 406 件一致（.check/20261122-103500） |
| B-33 | エラー | ヘッダーでも stray_cr・quote_junk・unterminated_quote は出る（row null） | E25・E29 | 必須 | PASS | parser-engineer | NOTES B-33；fuzz 406 件一致（.check/20261122-103500） |
| B-34 | エラー順 | 読んだ順。quote_junk はフィールド末、short/long はレコード末 | E19・E23・E26 | 必須 | PASS | parser-engineer | NOTES B-34；fuzz 406 件一致（.check/20261122-103500） |
