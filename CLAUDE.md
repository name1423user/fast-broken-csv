# CLAUDE.md

仕様は SPEC.md、順序は PLAN.md。SPEC.md・PLAN.md・このファイルが食い違ったら、作業を止めて確認する。ユーザーへの返答は日本語。

## コマンド
- キット: `KIT="kit-dl/csv-reader-speed-01-run-20261121-kit"`
- 採点: `node $KIT/cli/makefun.mjs grade-local --kit $KIT --bot . --worktree`（Docker 起動が前提）
- 一致テスト: `node scripts/fuzz.mjs`
- 速度: `node scripts/bench.mjs`

## 常にやる
- `solve.js` を変えたら fuzz と grade-local を回し、不一致 0 件を確認してから次へ。
- 速度の比較は Node 22（Docker）の値で判断する。

## 先に確認
- push、公開リポジトリの作成、提出（submit）、記録の bundle。

## 絶対やらない
- csv-reader（vendor）や他の OSS のコードを写す。依存を追加する。WebAssembly・ネイティブを使う。
- ケース間で結果を使い回す。キーペアや API キーをリポジトリに入れる。
- 記録のセッションを消したり、思考部分を伏せたりする。

## チーム構成と持ち場（agentsTemplate 0.1.0 から統合）
| 担当 | 持ち場（書いてよい場所） | 役割 |
|---|---|---|
| リード（メインセッション） | `main.ts`、`scripts/`、`package.json`、`docs/DECISIONS.md`、`.claude/`、`compliance.json` | 土台・統合・判断 |
| `spec-analyst` | `docs/CHECKS.md`、`docs/BASELINE_NOTES.md` | 仕様と基準の挙動の読解（コードは書かない） |
| `parser-engineer` | `solve.js` | 読み込み処理の実装 |
| `grader` | `docs/CHECKS.md` の状態欄、`docs/PROGRESS.md` | `bash scripts/check.sh` の実行と失敗の振り分け |
| `determinism-auditor` | なし（読むだけ） | 2回実行の一致・不定要素の確認 |
| `perf-engineer` | `solve.js`（M3 から。parser-engineer と同時に動かさない） | 正しさを保ったまま速くする |
| `release-auditor` | なし（読むだけ） | 提出前の最終確認 |

- 他人の持ち場は編集しない。必要なら止めてリードに報告する。
- 検証: `bash scripts/check.sh`（規約チェック → fuzz → grade-local）。規約チェックだけなら `python3 scripts/compliance.py`。
- 版番号ファイルは `package.json`（0.1.0 から）。Git タグは打たない。台帳 ruria-versions-registry への登録は、リポジトリを作る M4-T02 で行う（2026-11-22 ユーザー決定）。
