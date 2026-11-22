#!/usr/bin/env python3
"""規約チェック（Python 標準ライブラリのみ）。設定はリポジトリ直下の compliance.json。

使い方: python3 scripts/compliance.py
ERROR が1つでもあれば終了コード1。WARN は要確認。
秘密情報の検査は設定に関係なく常に行う。
"""
import fnmatch
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MIB = 1024 * 1024

DEFAULTS = {
    "exclude_dirs": [".git", "node_modules", "target", ".venv", "venv", "__pycache__", "dist", "build", ".check"],
    "max_total_mib": None,
    "max_file_mib": None,
    "required_files": ["LICENSE*"],
    "source_globs": ["src/**"],
    "forbidden": [],
    "secret_scan_max_mib": 2,
}

SECRETS = [
    (r"sk-ant-[A-Za-z0-9_-]{10,}", "Anthropic API キー"),
    (r"sk-(?:proj-)?[A-Za-z0-9]{20,}", "OpenAI API キー"),
    (r"gh[pousr]_[A-Za-z0-9]{30,}", "GitHub トークン"),
    (r"github_pat_[A-Za-z0-9_]{30,}", "GitHub トークン"),
    (r"AKIA[0-9A-Z]{16}", "AWS アクセスキー"),
    (r"xox[baprs]-[A-Za-z0-9-]{10,}", "Slack トークン"),
    (r"-----BEGIN [A-Z ]*PRIVATE KEY-----", "秘密鍵"),
    (r"(?m)^\s*\[\s*(?:\d{1,3}\s*,\s*){63}\d{1,3}\s*\]\s*$", "Solana キーペア（64バイト配列）"),
]


def load_config():
    cfg = dict(DEFAULTS)
    path = os.path.join(ROOT, "compliance.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            cfg.update({k: v for k, v in json.load(f).items() if not k.startswith("_")})
    return cfg


def walk(exclude):
    out = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = sorted(d for d in dirnames if d not in exclude)
        for name in sorted(filenames):
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, ROOT).replace(os.sep, "/")
            out.append((rel, full, os.path.getsize(full)))
    return out


def match_any(rel, globs):
    return any(fnmatch.fnmatch(rel, g) for g in globs)


def main():
    cfg = load_config()
    files = walk(set(cfg["exclude_dirs"]))
    errors, warns = [], []

    total = sum(s for _, _, s in files)
    if cfg["max_total_mib"] is not None and total > cfg["max_total_mib"] * MIB:
        errors.append(f"合計サイズ {total / MIB:.2f} MiB が上限 {cfg['max_total_mib']} MiB を超えています")
    if cfg["max_file_mib"] is not None:
        for rel, _, s in files:
            if s > cfg["max_file_mib"] * MIB:
                errors.append(f"{rel} が上限 {cfg['max_file_mib']} MiB を超えています")

    for pattern in cfg["required_files"]:
        if not any(fnmatch.fnmatch(rel, pattern) for rel, _, _ in files):
            errors.append(f"必須ファイル {pattern} がありません")

    sources = [(rel, full) for rel, full, _ in files if match_any(rel, cfg["source_globs"])]
    for rule in cfg["forbidden"]:
        rx = re.compile(rule["pattern"])
        scope = rule.get("in", "source")
        targets = sources if scope == "source" else [(r, f) for r, f, _ in files]
        if "files" in rule:
            targets = [(r, f) for r, f in targets if match_any(r, rule["files"])]
        bucket = errors if rule.get("level", "error") == "error" else warns
        for rel, full in targets:
            try:
                lines = open(full, encoding="utf-8").read().split("\n")
            except (UnicodeDecodeError, OSError):
                continue
            for i, line in enumerate(lines, 1):
                if rx.search(line) and "allow-compliance" not in line:
                    bucket.append(f"{rel}:{i}: {rule.get('message', rule['pattern'])}")

    limit = cfg["secret_scan_max_mib"] * MIB
    for rel, full, s in files:
        base = rel.rsplit("/", 1)[-1]
        if base == ".env" or base.startswith(".env."):
            errors.append(f"{rel}: .env ファイルが含まれています")
        if s > limit:
            continue
        try:
            text = open(full, encoding="utf-8").read()
        except (UnicodeDecodeError, OSError):
            continue
        for pat, name in SECRETS:
            if re.search(pat, text):
                errors.append(f"{rel}: {name}の疑い")

    print(f"ファイル {len(files)} 個 / 合計 {total / MIB:.2f} MiB")
    for w in warns:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    print(f"NG（ERROR {len(errors)} 件）" if errors else f"OK（WARN {len(warns)} 件）")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
