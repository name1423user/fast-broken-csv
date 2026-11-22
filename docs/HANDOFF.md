# HANDOFF（別のチャットで続きをするためのメモ）

最終更新: 2026-11-22（M4-T02 完了時点、コミット 42d173b の次）。新しいチャットでは、まず CLAUDE.md・SPEC.md・PLAN.md とこのファイルを読む。

## 2026-11-22 午後の追記（M5: バイト列変換器。上の「いまの状態」より新しい）

- 方針（ユーザー決定）: main.ts は1行の import、本体は transducer.js（cases.json をバイトのまま走査して答えの JSON を直接書く）。solve.js は正しさのアンカーとフォールバック。純 JS のみ。
- 最新の push: 54ca6d9（準備走行 3 周）。その前: 88131f3（ループ展開を切る）、92237f4（header 後決め・SWAR）、09b22f7（変換器化）。
- 外部の独立計測（ユーザー）: 練習 6/6、別シード 5 セット 30 ケース完全一致。net は旧 0.358 秒 → 0.043 秒 → ほぼ 0（gross 0.313 → 0.270 秒）。
- 手元 Docker（scratch の multibench、15 回の中央値、空実行を引いた net）: 現行 64.4ms / 理想ループの床（全バイトを SWAR で1回なめるだけ）42.1ms / 入出力の床（読み＋UTF-8 検証＋12MB 書き）17.7ms / 読みだけ 4.8ms。
- 効いたもの: 型除去を避ける（main.ts を1行に）、準備走行（型情報不足の最適化解除 18 回→0）、`--no-concurrent-recompilation`、`--no-turbo-loop-peeling`、header 後決め（indexOf をやめる）、SWAR、準備走行 8→3 周。
- 効かなかったもの: V8 の段階フラグ（invocation-count 系・no-maglev・Maglev のみ）、他の turbo-* フラグ、カンマを SWAR ループ内で処理（遅くなった）、readPlain の SWAR 化（差なし）、準備走行を長くする。
- 検証: `bash scripts/heavy.sh bash scripts/check.sh`（規約 → fuzz 420 件 → fuzz-main 32 回 → grade-local）。重い処理は必ず scripts/heavy.sh を通して直列に。
- 16 時以降に試して効かなかったもの: DataView をローカル変数に写す（差なし）、readPlain の SWAR 化（差なし、戻した）。
- 次に試す候補（未着手）: 引用符つきフィールドの読みを readRecord に取り込む（関数呼び出し 9.5 万回とグローバル同期を省く。ただしカンマのその場処理は遅くなったので要計測）、UTF-8 検証（約 2.5ms）を省くかどうかはユーザー判断（JSON.stringify の出力では不正な UTF-8 は起きないが、全入力での一致の保証が外れる）。
- 計測の道具（scratch、別セッションでは作り直し）: multibench.mjs（複数ボットを交互に Docker 実行して cgroup の CPU 時間の中央値）、variant.py（transducer.js の置換コピー）、mkvar.sh、lineprof.sh。床の構成は「空 main.ts」「読みだけ」「読み＋書き」「読み＋UTF-8＋書き」「理想ループ（全バイト SWAR）」。
- gVisor（runsc）計測（ユーザー指示、未着手）: docker に runsc は未登録（runc のみ、2026-11-22 夕方確認）。手順は ../makeFun/github-core-clone-01/docs/PROGRESS.md「perf フェーズ4」（gVisor 20261102 を daemon.json に runtime `runsc` で登録、gvisor-bin を /usr/local/bin へ）。ただし手順の tarball は x86_64 で、この Mac の Docker は arm64 → aarch64 版（同じリリースの .../release/20261102/aarch64/）が要る。ダウンロードと daemon 設定の変更・Docker 再起動はユーザー確認のうえで。入れたら multibench を `--runtime=runsc` で回し、空・読みのみ・読み＋書き・現行の net を runc と比べる（runsc の数字を正とする）。grade-local は runc のままにする（runsc 既定だと止まる）。
- 次の候補（引用符つきの読みを readRecord に取り込む）は未着手。UTF-8 検証を省く件は判断待ちで現状維持。
- 残りの判断: 提出（bundle・submit）はユーザーの指示待ち。20 時（JST）まで詰める指示。審査上の注意: ルール文面は main.ts が run で解く形を想定しており、変換器は通常 run を呼ばない（ユーザー決定で進めた）。

## いまの状態（M4 時点）

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
