#!/usr/bin/env bash
# 計測系の重い処理（bench・fuzz・grade-local）を1つずつ直列に走らせる。同時に走ると CPU を取り合って数字が壊れる。
# 使い方: bash scripts/heavy.sh <コマンド...>   （先に走っているものがあれば終わるまで待つ）
# mkdir をロックに使う。kill -9 などでロックが残ったら .check/heavy.lock を消す。
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
LOCK="$REPO/.check/heavy.lock"
mkdir -p "$REPO/.check"
until mkdir "$LOCK" 2>/dev/null; do sleep 2; done
trap 'rmdir "$LOCK"' EXIT
"$@"
