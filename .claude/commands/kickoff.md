---
description: 仕様の読み込み→台帳照合→土台づくりまでを進める（/adapt の後に1回）
---

CLAUDE.md を読んでから、次の順で進めてください。

1. CLAUDE.md に `TEMPLATE-STATE` が残っていたら止めて、先に `/adapt` を実行するよう伝える。
2. version-registry スキルで台帳と版番号ファイルを照合する。
3. `spec-analyst` サブエージェントに、仕様・テスト・要件の読解と `docs/CHECKS.md`（必要なら `docs/SCORING.md`・`docs/INTERFACES.md`）の作成を任せる。
4. その結果を読み、私に次を短く報告する:
   - 満たすべき項目の数と区分ごとの内訳
   - 点や評価が多く乗る場所（あれば）
   - 仕様が曖昧で、決めないと進めない点
   - 実装の優先順位
5. 私の了承を待たずに、リードの持ち場（エントリポイント・共有の型・データ層）の土台を作る。
6. `bash scripts/check.sh` が動くことを確認し、`/parallel` に進める状態にする。

$ARGUMENTS
