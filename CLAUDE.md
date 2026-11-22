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
