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
- gVisor（runsc）計測: **17 時に構築・計測済み → 下の「gVisor 計測環境」の節**。以下は着手前のメモ: docker に runsc は未登録（runc のみ、2026-11-22 夕方確認）。手順は ../makeFun/github-core-clone-01/docs/PROGRESS.md「perf フェーズ4」（gVisor 20261102 を daemon.json に runtime `runsc` で登録、gvisor-bin を /usr/local/bin へ）。ただし手順の tarball は x86_64 で、この Mac の Docker は arm64 → aarch64 版（同じリリースの .../release/20261102/aarch64/）が要る。ダウンロードと daemon 設定の変更・Docker 再起動はユーザー確認のうえで。入れたら multibench を `--runtime=runsc` で回し、空・読みのみ・読み＋書き・現行の net を runc と比べる（runsc の数字を正とする）。grade-local は runc のままにする（runsc 既定だと止まる）。
- 次の候補（引用符つきの読みを readRecord に取り込む）は未着手。UTF-8 検証を省く件は判断待ちで現状維持。
- 残りの判断: 提出（bundle・submit）はユーザーの指示待ち。20 時（JST）まで詰める指示。審査上の注意: ルール文面は main.ts が run で解く形を想定しており、変換器は通常 run を呼ばない（ユーザー決定で進めた）。

## 2026-11-22 17 時の追記: gVisor 計測環境（colima + runsc）

- **構築: 成功**。手順は `bash scripts/gvisor/setup.sh [コミット]`（何度流してもよい。入っているものは飛ばし、/opt/bench を作り直す）。
  - colima 0.10.3（lima 2.3.0）を brew で導入。VM は vz・2vCPU・4GB・Ubuntu 24.04 aarch64、Docker 付き。
  - gVisor release-20261102.0 の aarch64 公式 tarball（`storage.googleapis.com/gvisor/releases/release/20261102/aarch64/gvisor.tar.bz2`）。sha512 一致: `574b5775…fd19980`（全桁は setup.sh）。この版には runsc 単体の URL が無く、tarball のみ。
  - 置き場所: `runsc`・`containerd-shim-runsc-v1` は VM の `/usr/local/bin/`、補助（gvisor_sentry ほか6個）は **`/usr/local/bin/gvisor-bin/`**（ここに無いと「sidecar gvisor_sentry not usable」で起動しない）。
  - 登録: `~/.colima/default/colima.yaml` の `docker.runtimes.runsc` に書き、`colima restart` で VM の `/etc/docker/daemon.json` に反映（daemon.json を直接書くと colima の起動時に上書きされるため）。`docker --context colima info` の Runtimes に runsc が出て、`--runtime=runsc` で node v22.23.4 が動くことを確認。
  - **既定の docker コンテキストは desktop-linux（Docker Desktop）のまま**。colima は `docker --context colima` で明示して使う。grade-local・bench.mjs は従来どおり Docker Desktop の runc。
- **本番の CPU 時間の読み方（キットの harness-src を読んで判明）**: gVisor の本番（k8s）は、サンドボックス内の perl ランチャーが子を待って `getrusage(RUSAGE_CHILDREN)` の user+sys を読む（grader/sandbox/k8s.ts の Timing）。値は gVisor Sentry の推定で、**10ms 刻み**、しかも「10ms ごとに、走っているタスクを最大 applicationCores 個（クォータの切り上げ、最低 2）まで1刻みずつ数える」。つまり **1 CPU 制限でも、同時に走る2スレッド（GC・コンパイルの補助スレッドなど）は二重に数えられる**。gVisor 内の cgroup には cpu.stat が無い（v1 のスタブ）。対照は null entry（何もしない入口）で、全周のその中央値を引く。docker ドライバ（runc）はホストの親 cgroup の usage_usec 差分。
- 計測の方法（`scripts/gvisor/run.sh`・`launch.pl`・`analyze.mjs`）: 本番に合わせ、コンテナ内で `perl launch.pl node /bot/main.ts`（getrusage(RUSAGE_CHILDREN) を µs で出す）を runc と runsc の両方で。`--cpus=1 --memory=1g --pids-limit=64 --network none`、入力とボットは VM のローカルディスク（/opt/bench、virtiofs を通さない）。1周 = 4版×2ランタイムをシャッフル、捨て周1 + 500 周（4000 回、約 12 分）。20% トリム平均、net = 版 − null、区間はブートストラップ 95%。現行版の出力は毎回 expected.json とバイト比較（4000 回すべて一致）。VM の steal 0、Mac の負荷平均は 7〜10（BackgroundShortcutRunner・duetexpertd が各約1コア）。
- 床の版: null（空の answers.json を書くだけ）／読みのみ（transducer と同じ3フラグ＋open/readSync で全体を読む）／読み＋書き（＋本物と同じ 12,073,175 B を書く）／現行版 54ca6d9。
- **結果（練習セット、500 周、ms、± は 95% 区間の半幅）**:

  | 版 | runc gross | runc net | runsc gross | runsc net |
  |---|---|---|---|---|
  | null（対照） | 45.1 ±0.1 | — | 80.0 ±1.0 | — |
  | 読みのみ | 47.0 ±0.1 | 1.8 ±0.1 | 75.9 ±1.0 | −4.0 ±1.3 |
  | 読み＋書き | 53.7 ±0.1 | 8.6 ±0.2 | 84.5 ±1.1 | 4.5 ±1.3 |
  | 現行版 54ca6d9 | 102.6 ±0.2 | 57.5 ±0.2 | 159.6 ±2.0 | **79.7 ±2.1** |

  - runsc − runc の net の差: 現行版 **+22.2 ±2.2ms**、読みのみ −5.9 ±1.3、読み＋書き −4.1 ±1.3。
  - 床の内訳: 入出力の床（読み＋書き）は runc で 8.6ms、runsc で約 4.5ms。現行版のうち入出力以外の処理は runc 約 49ms・runsc 約 75ms。**gVisor で増えるのは入出力ではなく JS の処理部分**。
  - runsc の「読みのみ」が null より低いのは、null が /output にファイルを作る（gofer 経由）ぶんと、10ms 刻みの推定のためと考える（未検証）。
  - 40 周の予備計測では runsc の区間が ±5〜7ms で、±2ms には 500 周が要った（runsc の1回の値は 60〜110ms と大きくばらつく）。
- 解釈と次の手（仮説、未検証）: 処理部分が runsc で約 1.5 倍になるのは、上の「同時に走るスレッドを二重に数える」規則で、V8 の補助スレッド（並行マーキング・スイーパー・コンパイル）の時間がそのまま上乗せされている可能性が高い。補助スレッドを減らすフラグ（`--single-threaded-gc` は実行中に設定すると落ちるので不可。`--no-concurrent-sweeping`・`--no-parallel-scavenge`・`--no-concurrent-marking` の類など）は、**runc では差が出なくても runsc で効くことがある**。速度の判断は今後この環境の runsc net で行う。
- 注意: 絶対値は本番（x86 の貸し機）とは違う。runsc と runc の差・版どうしの差を見る道具として使う。Mac の負荷が高いときは周回を増やす。計測中に他の重い処理（grade-local・fuzz）を同時に走らせない。

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
