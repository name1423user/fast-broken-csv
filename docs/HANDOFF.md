# HANDOFF（別のチャットで続きをするためのメモ）

最終更新: 2026-11-22（M4-T02 完了時点、コミット 42d173b の次）。新しいチャットでは、まず CLAUDE.md・SPEC.md・PLAN.md とこのファイルを読む。

## いまの状態

- バウンティ: make.fun「Read broken CSV files faster, 21 November 2026」（`csv-reader-speed-01-run-20261121`）。締切 **2026-11-23 02:42 UTC（11:42 JST）**。
- リポジトリ: https://github.com/name1423user/fast-broken-csv （公開、`main`）。版は `package.json` の 0.1.0。
- 完了: M1・M2・M3・M4-T01（README・LICENSE・`.makefun/owner.json`）・M4-T02（公開リポジトリ作成と push、About 設定）。
- 速さ: bench 比 0.213（基準の約 1/5 の CPU 時間、Node 22 / Docker）。
- 最後の確認:
  - fuzz 1310 件、不一致 0。
  - runJson の一致確認 1392 件、不一致 0。
  - grade-local は passed=1（6/6）、2回実行でバイト一致。GitHub から新しく clone したものでも同じ結果。

## 残り（順番どおり。どれもユーザーの確認を取ってから）

1. **M4-T03 bundle**:
   - 作成: `node $KIT/cli/makefun.mjs bundle --repo . --out <リポジトリ外>/transcripts.tar.gz`
   - 確認: `makefun check --bundle`
   - 試し実行（`--dry-run`）の結果:
     - 集めるもの: セッション 16 件、指示ファイル 47 件。
     - 自動で伏せられるもの: メール・ホームのパス・ユーザー名・認証情報らしきもの。
   - **未決**: 指示ファイルには、このプロジェクトと無関係な個人のスキルも含まれる。そのまま出すか、`--instructions none` で外すか、ユーザーの返答待ち。外すと審査で不利になる可能性がある。
   - 伏せるのは自動分だけ（SPEC）。セッションを消したり、思考部分を伏せたりしない。
   - bundle はリポジトリに入れない。
2. **M4-T04 submit**:
   ```
   makefun submit --competition csv-reader-speed-01-run-20261121 \
     --repo-url https://github.com/name1423user/fast-broken-csv --commit <push 済みの sha> \
     --title "<名前>" --bundle <file> --keypair ~/.makefun/keypairs/https_make.fun.json
   ```
   - 提出のあとに `status` を確認する。
3. **台帳**: ruria-versions-registry に fast-broken-csv 0.1.0 を登録する。
   - version-registry スキルを使う。
   - 台帳の main に push する。
4. **ユーザーに聞いたまま、返答がないこと**:
   - SPEC への追記（header:true でレコードが無いときは `columns: []`）。
   - 前セッションのスクラッチパッドにある worktree（opt/a・opt/b・opt/c）を片付けるかどうか。

## 決まりごと（CLAUDE.md の要点）

- **先に確認するもの**: push、公開リポジトリの作成、submit、bundle。
- **リポジトリにも出力にも出さないもの**:
  - `~/.makefun/credentials` と `~/.makefun/keypairs/` の中身。表示もしない。
  - ユーザーのメールアドレス。
- **`solve.js` を変えたら**: `node scripts/fuzz.mjs` と grade-local で不一致 0 を確かめてから次へ進む（入口は `bash scripts/check.sh`）。
- **速度の判断**: Docker（Node 22.23.4）の値で決める。
- **やらないこと**:
  - WASM・ネイティブを使う。
  - 依存を追加する。
  - 他の OSS のコードを写す。
  - ケース間で結果を使い回す。

## 速さについて分かっていること（詳しくは docs/DECISIONS.md・docs/BASELINE_NOTES.md）

- **時間の内訳**:

  | 部分 | 時間 |
  |---|---|
  | 起動と TS の型の除去（削れない） | 約 70〜80 ms |
  | 読み込み | 24 ms |
  | parse | 16 ms |
  | 解く処理 | 約 160〜190 ms |
  | 書き出し | 残り |

- **効かなかったもの**:
  - ウォームアップ
  - 実行中に設定する若い世代のサイズのフラグ
  - ESM と CJS の切り替え
  - main.ts のシンボリックリンク（取り込みで弾かれる）
- **落ちるもの**: `--single-threaded-gc` と、並行マーキングを切るフラグ。実行中に設定すると V8 が落ちる。使わない。
- **リーダーボード**: 上位の多くが WASM SIMD を名乗っている。make.fun の裁定はまだ出ていない。この提出は WASM なしで出す。
- **測定の道具**:
  - Docker の交互ベンチ: `node scripts/bench.mjs [A] [B] --runs N`
  - 重い処理を同時に走らせると CPU を取り合って値がぶれるので、1つずつ順番に回す。
