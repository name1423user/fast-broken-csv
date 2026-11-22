#!/usr/bin/env bash
# 検証の入口。grader エージェントと /check がこれを実行する。
# 使い方: bash scripts/check.sh [検証コマンドに渡す追加の引数]
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
OUT="$REPO/.check/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"

# ===== /adapt がこのプロジェクトの検証コマンドに書き換える =====
# 例: TEST_CMD="cargo test --all"
#     TEST_CMD="node --test"
#     TEST_CMD="python3 -m unittest discover -s tests"
#     TEST_CMD="(cd ../kit && node cli/grade.mjs --bot $REPO)"
TEST_CMD="node scripts/fuzz.mjs && node kit-dl/csv-reader-speed-01-run-20261121-kit/cli/makefun.mjs grade-local --kit kit-dl/csv-reader-speed-01-run-20261121-kit --bot . --worktree"
# ===============================================================

echo "== 規約チェック =="
python3 "$REPO/scripts/compliance.py" | tee "$OUT/compliance.log"
compliance=${PIPESTATUS[0]}

if [[ "$TEST_CMD" == *"{{"* ]]; then
  echo "TEST_CMD が未設定です（/adapt で設定）。規約チェックだけ実行しました。"
  exit "$compliance"
fi

echo "== 検証: $TEST_CMD $* =="
bash -c "$TEST_CMD \"\$@\"" _ "$@" 2>&1 | tee "$OUT/test.log"
status=${PIPESTATUS[0]}

echo "ログ: $OUT"
[ "$status" -ne 0 ] && exit "$status"
exit "$compliance"
