# PLAN: fast-broken-csv

SPEC.md の順序。各タスクは終わったら検証コマンドを実行し、結果を記録してから次へ進む。

## M1: 土台と検証の仕組み

| ID | 内容 | 対応 | 完了の判定 |
|---|---|---|---|
| M1-T01 | Docker Desktop の起動を確認し、基準そのもの（キットの `baselines/csv-reader`）を `grade-local` で採点できることを確かめる | 基盤（検証環境） | 基準で `passed = 1` |
| M1-T02 | リポジトリの雛形: `git init`、`.gitignore`（`kit-dl/` など）、MIT `LICENSE`、`package.json`（`"type": "module"`）、基準と同じ形の `main.ts`、仮の `solve.js` | 基盤 | `node main.ts` が練習セットで動く |
| M1-T03 | `scripts/fuzz.mjs`: 生成器（キットの `program/generator`）で seed ごとにケースを作り、基準と `solve.js` の答えを比べる。固定の境界ケースも含める | AC-002, AC-003 | 基準を `solve.js` 代わりに入れて不一致 0 件 |
| M1-T04 | `scripts/bench.mjs`: 基準と作品を交互に各 10 回実行し、CPU 時間の中央値と比を出す | AC-005 | 基準どうしで比 ≈ 1.0 |

## M2: 正しい読み込み処理

| ID | 内容 | 対応 | 完了の判定 |
|---|---|---|---|
| M2-T01 | 基準の `index.js` を読み、SPEC 3章との食い違いをメモする（コードは写さない） | 基盤 | メモが SPEC 3章を補う |
| M2-T02 | 1文字ずつ走査する `solve.js` を新規に書く（1パス、`charCodeAt`、`slice`） | AC-001, AC-003 | fuzz で不一致 0 件 |
| M2-T03 | 練習セットと 300 ケースで一致確認、`grade-local` で採点 | AC-001, AC-002, AC-004, AC-006 | `passed = 1` |

## M3: 高速化

| ID | 内容 | 対応 | 完了の判定 |
|---|---|---|---|
| M3-T01 | `indexOf` などでカンマ・改行・引用符までをまとめて切り出す | AC-005 | 一致を保ったまま bench の比が下がる |
| M3-T02 | 行配列・エラー生成の割り当てを減らす | AC-005 | 同上 |
| M3-T03 | V8 フラグ（`--no-incremental-marking` に加え、若い世代のサイズなど）を試す | AC-005 | 同上、2回実行の一致を保つ |
| M3-T04 | `main.ts` の読み込み・書き出しを速くする（答えの JSON 値は同じに保つ） | AC-005, AC-004 | 同上 |

各タスクの後に fuzz（AC-002, AC-003）と grade-local（AC-001）を回す。悪化した変更は戻す。

## M4: 公開と提出

| ID | 内容 | 対応 | 完了の判定 |
|---|---|---|---|
| M4-T01 | README（テンプレのバッジ3行、説明、実行方法）を書く | AC-007 | テンプレの項目がそろう |
| M4-T02 | 公開リポジトリ `name1423user/fast-broken-csv` を作って push、`gh repo edit` で About を設定 | AC-007 | github.com でコミットが開ける、合計 1MiB 以下 |
| M4-T03 | `bundle` でこのプロジェクトの全セッション（要件定義のセッションを含む）の記録をまとめ、`check` を通す | 基盤（提出） | `check` が通る |
| M4-T04 | `submit` で提出し、`/api/submissions/<id>/status` で結果を確認 | SC-3 | `passed = 1` |

区切り（確定）: 22日 21:00 JST の時点で M3 が終わっていなければ、M2 の版で M4 を先に行い、M3 の続きは再提出に回す。
