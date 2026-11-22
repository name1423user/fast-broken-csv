---
description: 検証を回して、失敗を担当ごとに振り分ける
---

`grader` サブエージェントで `bash scripts/check.sh $ARGUMENTS` を実行し、結果を `docs/CHECKS.md` と `docs/PROGRESS.md` に反映してください。

報告は次の形で短く:
- 合格数/総数とスコア（前回比）
- 後退した項目（あれば最初に）
- 担当ごとの失敗リスト
