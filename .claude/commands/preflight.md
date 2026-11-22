---
description: リリース・提出前の最終確認
---

1. `release-auditor` を起動する。`.claude/agents/` に `determinism-auditor`・`security-auditor`・`ui-reviewer` があれば、それらも**同時に**起動する。
2. 結果をまとめ、次の形で私に報告する:
   - NG の項目（直し方つき）。人間が操作する項目は分けて書く
   - そのまま出してよいかの判断
3. 私が了承したら、version-registry スキルの手順で版を上げ、版番号ファイルと台帳を更新して commit する。
4. 署名・ストア申請・提出・公開設定の変更など、人間が操作するものは実行しない。必要なコマンドや手順を書き出して渡す。

$ARGUMENTS
